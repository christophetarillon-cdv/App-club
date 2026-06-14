'use client';

import { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, query, where, addDoc, doc, getDoc,
  deleteDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

interface Dancer { id: string; firstName: string; lastName: string; accountEmail?: string; }
interface Season { id: string; label: string; }
interface PricingPlan { id: string; label: string; amount: number; conditions: string; seasonId: string; }
interface MembershipEntry {
  id: string;
  dancerId?: string;
  dancerName?: string;
  planLabel?: string;
  paymentGroupId?: string;
  pricingPlanId: string;
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
  status: string;
}

interface PaymentGroup {
  id: string;
  membershipIds: string[];
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
  dancers: { name: string; planLabel: string }[];
}

type PaymentMethod = 'cheque' | 'transfer' | 'cash';
type PayScope = 'me' | 'myAccount' | 'otherAccount';
type Step = 'who' | 'plan';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces',
};

export default function MembershipPage() {
  const { user } = useAuth();
  const [season, setSeason] = useState<Season | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [memberships, setMemberships] = useState<MembershipEntry[]>([]);
  const [paymentGroups, setPaymentGroups] = useState<PaymentGroup[]>([]);
  const [myDancers, setMyDancers] = useState<Dancer[]>([]);
  const [globalEnrolledIds, setGlobalEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Creation flow
  const [step, setStep] = useState<Step>('who');
  const [payScope, setPayScope] = useState<PayScope>('me');
  const [selectedDancerIds, setSelectedDancerIds] = useState<Set<string>>(new Set());
  const [selectedOtherDancers, setSelectedOtherDancers] = useState<Dancer[]>([]);

  // Other account search
  const [otherSearch, setOtherSearch] = useState('');
  const [allOtherDancers, setAllOtherDancers] = useState<Dancer[]>([]);
  const [otherSearchResults, setOtherSearchResults] = useState<Dancer[]>([]);
  const otherSearchLoaded = useRef(false);

  // Plan selection (per dancer)
  const [selectedPlanIds, setSelectedPlanIds] = useState<Record<string, string>>({});
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('cheque');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
      const seasonsSnap = await getDocs(query(collection(db, 'seasons'), where('isActive', '==', true)));
      if (seasonsSnap.empty) { setLoading(false); return; }
      const activeSeason = { id: seasonsSnap.docs[0]!.id, label: seasonsSnap.docs[0]!.data().label as string };
      setSeason(activeSeason);

      const accSnap = await getDoc(doc(db, 'accounts', user.uid));
      let myDancersList: Dancer[] = [];
      if (accSnap.exists()) {
        const dancerIds: string[] = accSnap.data().dancerIds ?? [];
        const dancerDocs = await Promise.all(dancerIds.map(id => getDoc(doc(db, 'dancers', id))));
        myDancersList = dancerDocs
          .filter(d => d.exists())
          .map(d => ({ id: d.id, firstName: d.data()!.firstName ?? '', lastName: d.data()!.lastName ?? '' }));
        setMyDancers(myDancersList);
        if (myDancersList[0]) setSelectedDancerIds(new Set([myDancersList[0].id]));
      }

      const idToken = await user.getIdToken();
      const [plansSnap, membershipSnap, groupsSnap, enrolledRes] = await Promise.all([
        getDocs(query(collection(db, 'pricingPlans'),
          where('seasonId', '==', activeSeason.id), where('isActive', '==', true))),
        getDocs(query(collection(db, 'memberships'),
          where('userId', '==', user.uid), where('seasonId', '==', activeSeason.id))),
        getDocs(query(collection(db, 'paymentGroups'),
          where('userId', '==', user.uid), where('seasonId', '==', activeSeason.id))),
        fetch(`/api/dancers/enrolled?seasonId=${activeSeason.id}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }).then(async r => { const d = await r.json(); return Array.isArray(d) ? d as string[] : []; })
          .catch(() => [] as string[]),
      ]);
      setGlobalEnrolledIds(new Set(enrolledRes));

      const loadedPlans: PricingPlan[] = plansSnap.docs.map(d => ({
        id: d.id, label: d.data().label, amount: d.data().amount,
        conditions: d.data().conditions ?? '', seasonId: d.data().seasonId,
      }));
      setPlans(loadedPlans);

      const dancerMap = new Map(myDancersList.map(d => [d.id, d]));
      const loadedMemberships: MembershipEntry[] = await Promise.all(
        membershipSnap.docs.map(async md => {
          const data = md.data();
          let dancerName: string | undefined;
          const dancerId: string | undefined = data.dancerId;
          if (dancerId) {
            const dancer = dancerMap.get(dancerId);
            if (dancer) {
              dancerName = `${dancer.firstName} ${dancer.lastName}`.trim();
            } else {
              const ds = await getDoc(doc(db, 'dancers', dancerId));
              if (ds.exists()) dancerName = `${ds.data().firstName} ${ds.data().lastName}`.trim();
            }
          }
          let planLabel: string | undefined = loadedPlans.find(p => p.id === data.pricingPlanId)?.label;
          if (!planLabel && data.pricingPlanId) {
            const ps = await getDoc(doc(db, 'pricingPlans', data.pricingPlanId));
            if (ps.exists()) planLabel = ps.data().label;
          }
          return {
            id: md.id, dancerId, dancerName, planLabel,
            paymentGroupId: data.paymentGroupId,
            pricingPlanId: data.pricingPlanId,
            totalDue: data.totalDue, totalPaid: data.totalPaid,
            paymentMethod: data.paymentMethod, paymentPlanStatus: data.paymentPlanStatus,
            installmentIds: data.installmentIds ?? [], status: data.status,
          };
        })
      );
      setMemberships(loadedMemberships);

      // Build payment groups with enriched dancer info
      const membershipById = new Map(loadedMemberships.map(m => [m.id, m]));
      const loadedGroups: PaymentGroup[] = groupsSnap.docs.map(gd => {
        const data = gd.data();
        const membershipIds: string[] = data.membershipIds ?? [];
        const dancers = membershipIds.map(mid => {
          const m = membershipById.get(mid);
          return { name: m?.dancerName ?? '—', planLabel: m?.planLabel ?? '—' };
        });
        return {
          id: gd.id, membershipIds,
          totalDue: data.totalDue, totalPaid: data.totalPaid,
          paymentMethod: data.paymentMethod, paymentPlanStatus: data.paymentPlanStatus,
          installmentIds: data.installmentIds ?? [],
          dancers,
        };
      });
      setPaymentGroups(loadedGroups);

      const hasAnyMembership = loadedMemberships.length > 0 || loadedGroups.length > 0;
      if (!hasAnyMembership) setShowCreateForm(true);
      } catch (err) {
        console.error('Erreur chargement cotisation:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Load all other dancers when "autre compte" is selected
  const loadOtherDancers = async () => {
    if (otherSearchLoaded.current) return;
    otherSearchLoaded.current = true;
    const dancerSnap = await getDocs(collection(db, 'dancers'));
    const myIds = new Set(myDancers.map(d => d.id));
    const others: Dancer[] = dancerSnap.docs
      .filter(d => !myIds.has(d.id) && !globalEnrolledIds.has(d.id))
      .map(d => ({
        id: d.id,
        firstName: d.data().firstName ?? '',
        lastName: d.data().lastName ?? '',
      }));
    setAllOtherDancers(others);
  };

  useEffect(() => {
    if (payScope !== 'otherAccount' || otherSearch.length < 2) {
      setOtherSearchResults([]);
      return;
    }
    const lower = otherSearch.toLowerCase();
    const alreadySelectedIds = new Set(selectedOtherDancers.map(d => d.id));
    setOtherSearchResults(
      allOtherDancers
        .filter(d => !alreadySelectedIds.has(d.id) &&
          `${d.firstName} ${d.lastName}`.toLowerCase().includes(lower))
        .slice(0, 6)
    );
  }, [otherSearch, allOtherDancers, payScope, selectedOtherDancers]);

  const handlePayScopeChange = (scope: PayScope) => {
    setPayScope(scope);
    if (scope === 'me') {
      if (myDancers[0]) setSelectedDancerIds(new Set([myDancers[0].id]));
    } else if (scope === 'myAccount') {
      setSelectedDancerIds(new Set(myDancers.map(d => d.id)));
    } else {
      if (myDancers[0]) setSelectedDancerIds(new Set([myDancers[0].id]));
      loadOtherDancers();
    }
  };

  const toggleMyDancer = (id: string) => {
    setSelectedDancerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      if (next.size === 0 && myDancers[0]) next.add(myDancers[0].id);
      return next;
    });
  };

  const addOtherDancer = (dancer: Dancer) => {
    setSelectedOtherDancers(prev =>
      prev.find(d => d.id === dancer.id) ? prev : [...prev, dancer]
    );
    setOtherSearch('');
  };

  const alreadyEnrolledIds = globalEnrolledIds;

  const allSelectedDancers: Dancer[] = [
    ...myDancers.filter(d => selectedDancerIds.has(d.id)),
    ...selectedOtherDancers,
  ];
  const dancersToCreate = allSelectedDancers.filter(d => !alreadyEnrolledIds.has(d.id));

  const resetCreateForm = () => {
    setStep('who');
    setPayScope('me');
    if (myDancers[0]) setSelectedDancerIds(new Set([myDancers[0].id]));
    setSelectedOtherDancers([]);
    setOtherSearch('');
    setSelectedPlanIds({});
    setSelectedMethod('cheque');
  };

  const allPlansFilled = dancersToCreate.length > 0 &&
    dancersToCreate.every(d => Boolean(selectedPlanIds[d.id]));

  const handleCreate = async () => {
    if (!user || !season || !allPlansFilled) return;
    setSubmitting(true);
    setCreateError(null);
    const newIds: string[] = [];
    try {
      for (const dancer of dancersToCreate) {
        const planId = selectedPlanIds[dancer.id]!;
        const plan = plans.find(p => p.id === planId)!;
        const ref = await addDoc(collection(db, 'memberships'), {
          userId: user.uid,
          dancerId: dancer.id,
          seasonId: season.id,
          pricingPlanId: planId,
          totalDue: plan.amount,
          totalPaid: 0,
          paymentMethod: selectedMethod,
          paymentPlanStatus: 'pending',
          installmentIds: [],
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        newIds.push(ref.id);
      }

      if (dancersToCreate.length === 1) {
        window.location.href = `/membership/payment-plan?membershipId=${newIds[0]}`;
      } else {
        const totalDue = dancersToCreate.reduce((sum, dancer) => {
          const planId = selectedPlanIds[dancer.id]!;
          return sum + (plans.find(p => p.id === planId)?.amount ?? 0);
        }, 0);
        const groupRef = await addDoc(collection(db, 'paymentGroups'), {
          userId: user.uid,
          membershipIds: newIds,
          totalDue,
          totalPaid: 0,
          paymentMethod: selectedMethod,
          paymentPlanStatus: 'pending',
          installmentIds: [],
          seasonId: season.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const batch = writeBatch(db);
        for (const mId of newIds) {
          batch.update(doc(db, 'memberships', mId), { paymentGroupId: groupRef.id });
        }
        await batch.commit();
        window.location.href = `/membership/payment-plan?groupId=${groupRef.id}`;
      }
    } catch (err: unknown) {
      console.error('Erreur création cotisation:', err);
      setCreateError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-10">
        <Link href="/profile" className="text-sm text-gray-400 hover:text-gray-700 mb-6 inline-block">← Profil</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Ma cotisation</h1>

        {!season && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400">Aucune saison active pour le moment.</p>
          </div>
        )}

        {season && (
          <div className="space-y-4">
            {/* Solo memberships (not part of a group) */}
            {memberships.filter(m => !m.paymentGroupId).map(m => (
              <MembershipCard
                key={m.id}
                membership={m}
                season={season}
                onCancel={async () => {
                  if (!confirm('Annuler cette cotisation ? Cette action est irréversible.')) return;
                  await deleteDoc(doc(db, 'memberships', m.id));
                  setMemberships(prev => prev.filter(x => x.id !== m.id));
                }}
              />
            ))}

            {/* Payment groups */}
            {paymentGroups.map(group => (
              <GroupMembershipCard
                key={group.id}
                group={group}
                season={season}
                onCancel={async () => {
                  if (!confirm('Annuler toutes les cotisations de ce groupe ? Cette action est irréversible.')) return;
                  const batch = writeBatch(db);
                  for (const mId of group.membershipIds) batch.delete(doc(db, 'memberships', mId));
                  batch.delete(doc(db, 'paymentGroups', group.id));
                  await batch.commit();
                  setPaymentGroups(prev => prev.filter(g => g.id !== group.id));
                  setMemberships(prev => prev.filter(m => !group.membershipIds.includes(m.id)));
                }}
              />
            ))}

            {/* Create form toggle */}
            {(memberships.length > 0 || paymentGroups.length > 0) && !showCreateForm && (
              <button
                onClick={() => { resetCreateForm(); setShowCreateForm(true); }}
                className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-4 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                + Ajouter une cotisation pour un autre danseur
              </button>
            )}

            {/* Creation form */}
            {showCreateForm && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800">
                    {memberships.length === 0 ? `Saison ${season.label}` : 'Nouvelle cotisation'}
                  </h2>
                  {memberships.length > 0 && (
                    <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                  )}
                </div>

                {/* Step 0: Who */}
                {step === 'who' && (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-3">Pour qui souhaitez-vous créer une cotisation ?</p>
                      <div className="space-y-2">
                        {/* Me only */}
                        <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${payScope === 'me' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input type="radio" name="scope" checked={payScope === 'me'} onChange={() => handlePayScopeChange('me')} className="mt-0.5" />
                          <div>
                            <p className="font-medium text-gray-900">Pour moi seul(e)</p>
                            {myDancers[0] && (
                              <p className="text-sm text-gray-500">{myDancers[0].firstName} {myDancers[0].lastName}</p>
                            )}
                          </div>
                        </label>

                        {/* Multiple dancers from my account */}
                        {myDancers.length > 1 && (
                          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${payScope === 'myAccount' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                            <input type="radio" name="scope" checked={payScope === 'myAccount'} onChange={() => handlePayScopeChange('myAccount')} className="mt-0.5" />
                            <div>
                              <p className="font-medium text-gray-900">Plusieurs danseurs de mon compte</p>
                              <p className="text-sm text-gray-500">{myDancers.map(d => `${d.firstName} ${d.lastName}`).join(', ')}</p>
                            </div>
                          </label>
                        )}

                        {/* Other account */}
                        <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${payScope === 'otherAccount' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input type="radio" name="scope" checked={payScope === 'otherAccount'} onChange={() => handlePayScopeChange('otherAccount')} className="mt-0.5" />
                          <div>
                            <p className="font-medium text-gray-900">Moi + danseurs d'un autre compte</p>
                            <p className="text-sm text-gray-500">Payer pour des danseurs d'un autre compte</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Dancer checkboxes for myAccount */}
                    {payScope === 'myAccount' && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sélectionnez les danseurs</p>
                        {myDancers.map(dancer => {
                          const enrolled = alreadyEnrolledIds.has(dancer.id);
                          return (
                            <label key={dancer.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${enrolled ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed' : selectedDancerIds.has(dancer.id) ? 'border-blue-500 bg-blue-50 cursor-pointer' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'}`}>
                              <input type="checkbox" checked={selectedDancerIds.has(dancer.id)} onChange={() => !enrolled && toggleMyDancer(dancer.id)} disabled={enrolled} className="mt-0.5" />
                              <span className="font-medium text-gray-900 flex-1">{dancer.firstName} {dancer.lastName}</span>
                              {enrolled && <span className="text-xs text-green-600 font-medium">Déjà inscrit(e)</span>}
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Other account search */}
                    {payScope === 'otherAccount' && (
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mes danseurs</p>
                          {myDancers.map(dancer => {
                            const enrolled = alreadyEnrolledIds.has(dancer.id);
                            return (
                              <label key={dancer.id} className={`flex items-center gap-3 p-3 rounded-xl border mb-1.5 transition-colors ${enrolled ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed' : selectedDancerIds.has(dancer.id) ? 'border-blue-500 bg-blue-50 cursor-pointer' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'}`}>
                                <input type="checkbox" checked={selectedDancerIds.has(dancer.id)} onChange={() => !enrolled && toggleMyDancer(dancer.id)} disabled={enrolled} />
                                <span className="font-medium text-gray-900 flex-1">{dancer.firstName} {dancer.lastName}</span>
                                {enrolled && <span className="text-xs text-green-600 font-medium">Déjà inscrit(e)</span>}
                              </label>
                            );
                          })}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rechercher un danseur d'un autre compte</p>
                          <div className="relative">
                            <input
                              type="text"
                              value={otherSearch}
                              onChange={e => setOtherSearch(e.target.value)}
                              placeholder="Rechercher par prénom nom ou email…"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                            {otherSearchResults.length > 0 && (
                              <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                                {otherSearchResults.map(d => (
                                  <button key={d.id} type="button" onClick={() => addOtherDancer(d)}
                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50">
                                    <span className="font-medium text-gray-900">{d.firstName} {d.lastName}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {selectedOtherDancers.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {selectedOtherDancers.map(d => (
                                <div key={d.id} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
                                  <span className="font-medium text-gray-900">{d.firstName} {d.lastName}</span>
                                  <button type="button" onClick={() => setSelectedOtherDancers(prev => prev.filter(x => x.id !== d.id))}
                                    className="text-red-400 hover:text-red-600 font-bold ml-2">✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setStep('plan')}
                      disabled={dancersToCreate.length === 0}
                      className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"
                    >
                      Continuer →
                    </button>
                  </>
                )}

                {/* Step 1: Plan per dancer + method */}
                {step === 'plan' && (
                  <>
                    {plans.length === 0 && (
                      <p className="text-sm text-gray-400">Aucun tarif disponible pour cette saison.</p>
                    )}

                    <div className="space-y-5">
                      {dancersToCreate.map(dancer => (
                        <div key={dancer.id}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            {dancer.firstName} {dancer.lastName}
                          </p>
                          <div className="space-y-2">
                            {plans.map(p => {
                              const checked = selectedPlanIds[dancer.id] === p.id;
                              return (
                                <label key={p.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                                  <input
                                    type="radio"
                                    name={`plan-${dancer.id}`}
                                    value={p.id}
                                    checked={checked}
                                    onChange={() => setSelectedPlanIds(prev => ({ ...prev, [dancer.id]: p.id }))}
                                    className="mt-0.5"
                                  />
                                  <div className="flex-1">
                                    <p className="font-medium text-gray-900">{p.label}</p>
                                    <p className="text-sm font-semibold text-blue-700">{(p.amount / 100).toFixed(2)} €</p>
                                    {p.conditions && <p className="text-xs text-gray-500 mt-0.5">{p.conditions}</p>}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {allPlansFilled && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mode de paiement</p>
                        <div className="flex gap-2">
                          {(['cheque', 'transfer', 'cash'] as PaymentMethod[]).map(m => (
                            <button key={m} type="button" onClick={() => setSelectedMethod(m)}
                              className={`text-sm px-4 py-2 rounded-lg font-medium border transition-colors ${selectedMethod === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                              {METHOD_LABEL[m]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {createError && (
                      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>
                    )}

                    <div className="flex gap-3">
                      <button onClick={() => setStep('who')}
                        className="flex-1 bg-gray-100 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-200 text-sm transition-colors">
                        ← Retour
                      </button>
                      <button onClick={handleCreate} disabled={!allPlansFilled || submitting}
                        className="flex-[2] bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
                        {submitting ? 'Création…' : dancersToCreate.length > 1 ? `Créer les ${dancersToCreate.length} cotisations` : 'Créer la cotisation'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MembershipCard({ membership, season, onCancel }: {
  membership: MembershipEntry;
  season: Season;
  onCancel: () => Promise<void>;
}) {
  const METHOD_LABEL: Record<string, string> = {
    cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start justify-between">
        <div>
          {membership.dancerName && (
            <p className="text-xs font-semibold text-blue-600 mb-0.5">{membership.dancerName}</p>
          )}
          <h2 className="font-semibold text-gray-800">{membership.planLabel ?? 'Cotisation'}</h2>
          <p className="text-xs text-gray-400 mt-0.5">Saison {season.label}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          membership.status === 'active' ? 'bg-green-100 text-green-700' :
          membership.status === 'complete' ? 'bg-blue-100 text-blue-700' :
          'bg-orange-100 text-orange-700'
        }`}>
          {membership.status === 'active' ? 'Active' : membership.status === 'complete' ? 'Soldée' : 'En attente'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-400 text-xs">Total dû</p>
          <p className="font-semibold text-gray-900">{(membership.totalDue / 100).toFixed(2)} €</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Total payé</p>
          <p className={`font-semibold ${membership.totalPaid >= membership.totalDue ? 'text-green-700' : 'text-gray-900'}`}>
            {(membership.totalPaid / 100).toFixed(2)} €
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Mode de paiement</p>
          <p className="font-medium text-gray-700">{METHOD_LABEL[membership.paymentMethod] ?? membership.paymentMethod}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Plan de paiement</p>
          <p className={`font-medium ${
            membership.paymentPlanStatus === 'approved' ? 'text-green-700' :
            membership.paymentPlanStatus === 'rejected' ? 'text-red-600' : 'text-orange-600'
          }`}>
            {membership.paymentPlanStatus === 'approved' ? 'Approuvé' :
             membership.paymentPlanStatus === 'rejected' ? 'Refusé' : 'En attente'}
          </p>
        </div>
      </div>

      {membership.paymentPlanStatus === 'pending' && membership.installmentIds.length === 0 && (
        <div className="mt-4 flex gap-2">
          <Link href={`/membership/payment-plan?membershipId=${membership.id}`}
            className="flex-[3] block text-center bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 text-sm transition-colors">
            Proposer un plan de paiement →
          </Link>
          <button onClick={onCancel}
            className="flex-1 text-sm font-medium text-red-500 border border-red-200 rounded-lg py-2.5 hover:bg-red-50 transition-colors">
            Annuler
          </button>
        </div>
      )}
      {membership.paymentPlanStatus === 'rejected' && (
        <Link href={`/membership/payment-plan?membershipId=${membership.id}`}
          className="block w-full text-center mt-4 bg-orange-600 text-white font-semibold py-2.5 rounded-lg hover:bg-orange-700 text-sm transition-colors">
          Modifier le plan de paiement →
        </Link>
      )}
    </div>
  );
}

function GroupMembershipCard({ group, season, onCancel }: {
  group: PaymentGroup;
  season: Season;
  onCancel: () => Promise<void>;
}) {
  const METHOD_LABEL: Record<string, string> = {
    cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces',
  };
  const statusLabel = group.paymentPlanStatus === 'approved' ? 'Approuvé' :
    group.paymentPlanStatus === 'rejected' ? 'Refusé' : 'En attente';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-semibold text-gray-800">Cotisations groupées</h2>
          <p className="text-xs text-gray-400 mt-0.5">Saison {season.label}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          group.paymentPlanStatus === 'approved' ? 'bg-green-100 text-green-700' :
          group.paymentPlanStatus === 'rejected' ? 'bg-red-100 text-red-600' :
          'bg-orange-100 text-orange-700'
        }`}>{statusLabel}</span>
      </div>

      <div className="space-y-1 mb-4">
        {group.dancers.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900">{d.name}</span>
            <span className="text-gray-500">{d.planLabel}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm border-t border-gray-100 pt-3">
        <div>
          <p className="text-gray-400 text-xs">Total dû</p>
          <p className="font-semibold text-gray-900">{(group.totalDue / 100).toFixed(2)} €</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Total payé</p>
          <p className={`font-semibold ${group.totalPaid >= group.totalDue ? 'text-green-700' : 'text-gray-900'}`}>
            {(group.totalPaid / 100).toFixed(2)} €
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Mode de paiement</p>
          <p className="font-medium text-gray-700">{METHOD_LABEL[group.paymentMethod] ?? group.paymentMethod}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Plan de paiement</p>
          <p className={`font-medium ${
            group.paymentPlanStatus === 'approved' ? 'text-green-700' :
            group.paymentPlanStatus === 'rejected' ? 'text-red-600' : 'text-orange-600'
          }`}>{statusLabel}</p>
        </div>
      </div>

      {group.paymentPlanStatus === 'pending' && group.installmentIds.length === 0 && (
        <div className="mt-4 flex gap-2">
          <Link href={`/membership/payment-plan?groupId=${group.id}`}
            className="flex-[3] block text-center bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 text-sm transition-colors">
            Proposer un plan de paiement →
          </Link>
          <button onClick={onCancel}
            className="flex-1 text-sm font-medium text-red-500 border border-red-200 rounded-lg py-2.5 hover:bg-red-50 transition-colors">
            Annuler
          </button>
        </div>
      )}
      {group.paymentPlanStatus === 'rejected' && (
        <Link href={`/membership/payment-plan?groupId=${group.id}`}
          className="block w-full text-center mt-4 bg-orange-600 text-white font-semibold py-2.5 rounded-lg hover:bg-orange-700 text-sm transition-colors">
          Modifier le plan de paiement →
        </Link>
      )}
    </div>
  );
}
