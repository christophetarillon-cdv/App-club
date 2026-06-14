'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';

interface Account { id: string; displayName: string; email: string; }
interface Dancer { id: string; firstName: string; lastName: string; accountId: string; }
interface Season { id: string; label: string; }
interface PricingPlan { id: string; label: string; amount: number; conditions: string; }
interface Installment { expectedDate: string; amount: string; }

type PaymentMethod = 'cheque' | 'transfer' | 'cash';
type Step = 'who' | 'plan' | 'schedule';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces',
};

const emptyInstallment = (): Installment => ({ expectedDate: '', amount: '' });

export default function AdminCreatePaymentPlanPage() {
  const [step, setStep] = useState<Step>('who');
  const [season, setSeason] = useState<Season | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [allDancers, setAllDancers] = useState<Dancer[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [searchResults, setSearchResults] = useState<Dancer[]>([]);
  const [selectedDancers, setSelectedDancers] = useState<Dancer[]>([]);

  const [selectedPlanIds, setSelectedPlanIds] = useState<Record<string, string>>({});
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('cheque');

  const [installments, setInstallments] = useState<Installment[]>([emptyInstallment()]);

  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      const [seasonsSnap, dancerSnap, accountSnap] = await Promise.all([
        getDocs(query(collection(db, 'seasons'), where('isActive', '==', true))),
        getDocs(collection(db, 'dancers')),
        getDocs(collection(db, 'accounts')),
      ]);
      if (!seasonsSnap.empty) {
        const s = seasonsSnap.docs[0]!;
        setSeason({ id: s.id, label: s.data().label });

        const [plansSnap, approvedSnap] = await Promise.all([
          getDocs(query(collection(db, 'pricingPlans'),
            where('seasonId', '==', s.id), where('isActive', '==', true))),
          getDocs(query(collection(db, 'memberships'),
            where('seasonId', '==', s.id), where('paymentPlanStatus', '==', 'approved'))),
        ]);
        setPlans(plansSnap.docs.map(d => ({
          id: d.id, label: d.data().label, amount: d.data().amount,
          conditions: d.data().conditions ?? '',
        })));

        // Build enrolled set with backward compat (old memberships without dancerId)
        const enrolled = new Set<string>();
        const userIdsToLookup: string[] = [];
        for (const d of approvedSnap.docs) {
          const dancerId = d.data().dancerId as string | undefined;
          if (dancerId) {
            enrolled.add(dancerId);
          } else {
            const userId = d.data().userId as string | undefined;
            if (userId) userIdsToLookup.push(userId);
          }
        }
        if (userIdsToLookup.length > 0) {
          const accountDocs = await Promise.all(
            userIdsToLookup.map(uid => getDoc(doc(db, 'accounts', uid)))
          );
          for (const acc of accountDocs) {
            if (acc.exists()) {
              const dancerIds: string[] = acc.data().dancerIds ?? [];
              if (dancerIds[0]) enrolled.add(dancerIds[0]);
            }
          }
        }
        setEnrolledIds(enrolled);
      }
      setAllDancers(dancerSnap.docs.map(d => ({
        id: d.id,
        firstName: d.data().firstName ?? '',
        lastName: d.data().lastName ?? '',
        accountId: d.data().accountId ?? '',
      })));
      setAllAccounts(accountSnap.docs.map(d => ({
        id: d.id,
        displayName: d.data().displayName ?? '',
        email: d.data().email ?? '',
      })));
    })();
  }, []);

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const lower = searchQuery.toLowerCase();
    const selectedIds = new Set(selectedDancers.map(d => d.id));
    const matches = allDancers.filter(d =>
      !selectedIds.has(d.id) &&
      `${d.firstName} ${d.lastName}`.toLowerCase().includes(lower)
    );
    // Non-inscrits en premier, inscrits grisés après
    matches.sort((a, b) => {
      const aE = enrolledIds.has(a.id);
      const bE = enrolledIds.has(b.id);
      return aE === bE ? 0 : aE ? 1 : -1;
    });
    setSearchResults(matches.slice(0, 8));
  }, [searchQuery, allDancers, selectedDancers, enrolledIds]);

  const addDancer = (dancer: Dancer) => {
    setSelectedDancers(prev => prev.find(d => d.id === dancer.id) ? prev : [...prev, dancer]);
    setSearchQuery('');
  };

  // targetUserId = first selected dancer's account
  const targetUserId = selectedDancers[0]?.accountId ?? '';

  const allPlansFilled = selectedDancers.length > 0 &&
    selectedDancers.every(d => Boolean(selectedPlanIds[d.id]));

  const totalDue = selectedDancers.reduce((sum, d) => {
    const plan = plans.find(p => p.id === selectedPlanIds[d.id]);
    return sum + (plan?.amount ?? 0);
  }, 0);

  const totalCents = installments.reduce((sum, i) => {
    const v = parseFloat(i.amount);
    return sum + (isNaN(v) ? 0 : Math.round(v * 100));
  }, 0);
  const remaining = totalDue - totalCents;

  const handleSubmit = async () => {
    if (!season || selectedDancers.length === 0 || !allPlansFilled || !targetUserId) return;
    setError(null);
    if (Math.abs(remaining) > 0) {
      setError(`Le total des versements doit être égal au montant dû (${(totalDue / 100).toFixed(2)} €).`);
      return;
    }
    for (const i of installments) {
      if (!i.expectedDate || !i.amount || parseFloat(i.amount) <= 0) {
        setError('Tous les versements doivent avoir une date et un montant valide.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const installmentRefs = installments.map(() => doc(collection(db, 'paymentInstallments')));
      const installmentIds = installmentRefs.map(r => r.id);

      if (selectedDancers.length === 1) {
        const dancer = selectedDancers[0]!;
        const plan = plans.find(p => p.id === selectedPlanIds[dancer.id])!;
        const mRef = doc(collection(db, 'memberships'));

        for (let i = 0; i < installments.length; i++) {
          batch.set(installmentRefs[i]!, {
            membershipId: mRef.id,
            userId: targetUserId,
            amount: Math.round(parseFloat(installments[i]!.amount) * 100),
            method: selectedMethod,
            expectedDate: installments[i]!.expectedDate,
            status: 'pending',
          });
        }

        batch.set(mRef, {
          userId: targetUserId,
          dancerId: dancer.id,
          seasonId: season.id,
          pricingPlanId: selectedPlanIds[dancer.id]!,
          totalDue: plan.amount,
          totalPaid: 0,
          paymentMethod: selectedMethod,
          paymentPlanStatus: 'approved',
          installmentIds,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const groupRef = doc(collection(db, 'paymentGroups'));
        const membershipIds: string[] = [];

        for (const dancer of selectedDancers) {
          const plan = plans.find(p => p.id === selectedPlanIds[dancer.id])!;
          const mRef = doc(collection(db, 'memberships'));
          membershipIds.push(mRef.id);
          batch.set(mRef, {
            userId: targetUserId,
            dancerId: dancer.id,
            seasonId: season.id,
            pricingPlanId: selectedPlanIds[dancer.id]!,
            totalDue: plan.amount,
            totalPaid: 0,
            paymentMethod: selectedMethod,
            paymentPlanStatus: 'approved',
            installmentIds: [],
            status: 'active',
            paymentGroupId: groupRef.id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        for (let i = 0; i < installments.length; i++) {
          batch.set(installmentRefs[i]!, {
            paymentGroupId: groupRef.id,
            userId: targetUserId,
            amount: Math.round(parseFloat(installments[i]!.amount) * 100),
            method: selectedMethod,
            expectedDate: installments[i]!.expectedDate,
            status: 'pending',
          });
        }

        batch.set(groupRef, {
          userId: targetUserId,
          membershipIds,
          totalDue,
          totalPaid: 0,
          paymentMethod: selectedMethod,
          paymentPlanStatus: 'approved',
          installmentIds,
          seasonId: season.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setSuccess(true);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSuccess(false);
    setStep('who');
    setSelectedDancers([]);
    setSelectedPlanIds({});
    setSelectedMethod('cheque');
    setInstallments([emptyInstallment()]);
    setError(null);
  };

  const stepIndex = (s: Step) => ['who', 'plan', 'schedule'].indexOf(s);
  const currentIndex = stepIndex(step);

  if (success) {
    const account = allAccounts.find(a => a.id === targetUserId);
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Plan créé</h1>
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4">
          <p className="text-green-800 font-semibold">Plan de paiement créé et approuvé.</p>
          <p className="text-sm text-green-700 mt-1">
            {selectedDancers.map(d => `${d.firstName} ${d.lastName}`).join(', ')}
            {account && ` · ${account.email}`}
          </p>
          <p className="text-sm text-green-700 mt-0.5">
            {(totalDue / 100).toFixed(2)} € · {METHOD_LABEL[selectedMethod]} · {installments.length} versement{installments.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/payment-plans"
            className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700">
            Retour aux plans
          </Link>
          <button onClick={resetForm}
            className="text-sm px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
            Créer un autre plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <Link href="/admin/payment-plans" className="text-sm text-gray-400 hover:text-gray-700 mb-6 inline-block">← Plans de paiement</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Créer un plan de paiement</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-6">
        {(['who', 'plan', 'schedule'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? 'text-blue-700' : i < currentIndex ? 'text-green-600' : 'text-gray-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-blue-600 text-white' : i < currentIndex ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {i + 1}
              </span>
              {s === 'who' ? 'Pour qui' : s === 'plan' ? 'Tarifs' : 'Versements'}
            </div>
            {i < 2 && <span className="text-gray-300 mx-1">›</span>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">

        {/* Step 1: Who */}
        {step === 'who' && (
          <>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Rechercher un danseur</p>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Prénom nom…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {searchResults.map(d => {
                      const account = allAccounts.find(a => a.id === d.accountId);
                      const enrolled = enrolledIds.has(d.id);
                      return (
                        <button key={d.id} type="button"
                          onClick={() => !enrolled && addDancer(d)}
                          disabled={enrolled}
                          className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 last:border-0 ${enrolled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-50'}`}>
                          <span className="font-medium text-gray-900">{d.firstName} {d.lastName}</span>
                          {account && <span className="text-gray-400 ml-2 text-xs">{account.email}</span>}
                          {enrolled && <span className="ml-2 text-xs text-green-600 font-medium">Déjà inscrit(e)</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {selectedDancers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Danseurs sélectionnés</p>
                {selectedDancers.map(d => {
                  const account = allAccounts.find(a => a.id === d.accountId);
                  return (
                    <div key={d.id} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-900">{d.firstName} {d.lastName}</span>
                        {account && <span className="text-gray-400 ml-2 text-xs">{account.email}</span>}
                      </div>
                      <button type="button" onClick={() => setSelectedDancers(prev => prev.filter(x => x.id !== d.id))}
                        className="text-red-400 hover:text-red-600 font-bold ml-2">✕</button>
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={() => setStep('plan')} disabled={selectedDancers.length === 0}
              className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
              Continuer →
            </button>
          </>
        )}

        {/* Step 2: Plans */}
        {step === 'plan' && (
          <>
            {season && <p className="text-xs text-gray-500">Saison {season.label}</p>}

            <div className="space-y-5">
              {selectedDancers.map(dancer => (
                <div key={dancer.id}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {dancer.firstName} {dancer.lastName}
                  </p>
                  <div className="space-y-2">
                    {plans.map(p => {
                      const checked = selectedPlanIds[dancer.id] === p.id;
                      return (
                        <label key={p.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input type="radio" name={`plan-${dancer.id}`} value={p.id} checked={checked}
                            onChange={() => setSelectedPlanIds(prev => ({ ...prev, [dancer.id]: p.id }))}
                            className="mt-0.5" />
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
              <>
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
                {selectedDancers.length > 1 && (
                  <div className="text-sm bg-gray-50 rounded-lg px-3 py-2 text-gray-700">
                    Total : <span className="font-semibold">{(totalDue / 100).toFixed(2)} €</span>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('who')}
                className="flex-1 bg-gray-100 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-200 text-sm transition-colors">
                ← Retour
              </button>
              <button onClick={() => setStep('schedule')} disabled={!allPlansFilled}
                className="flex-[2] bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
                Continuer →
              </button>
            </div>
          </>
        )}

        {/* Step 3: Schedule */}
        {step === 'schedule' && (
          <>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Plan de versements</p>
              <p className="text-xs text-gray-500 mb-3">
                Montant total : <span className="font-semibold text-gray-800">{(totalDue / 100).toFixed(2)} €</span>
              </p>
            </div>

            <div className="space-y-3">
              {installments.map((inst, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-400 w-6">{idx + 1}.</span>
                  <input type="date" value={inst.expectedDate}
                    onChange={e => setInstallments(prev => prev.map((x, i) => i === idx ? { ...x, expectedDate: e.target.value } : x))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <div className="relative w-32">
                    <input type="number" step="0.01" min="0" value={inst.amount}
                      onChange={e => setInstallments(prev => prev.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-7"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">€</span>
                  </div>
                  {installments.length > 1 && (
                    <button type="button" onClick={() => setInstallments(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                  )}
                </div>
              ))}
            </div>

            <button type="button" onClick={() => setInstallments(prev => [...prev, emptyInstallment()])}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              + Ajouter un versement
            </button>

            <div className={`flex justify-between items-center text-sm font-semibold pt-2 border-t border-gray-100 ${Math.abs(remaining) > 0 ? 'text-orange-600' : 'text-green-700'}`}>
              <span>Total saisi</span>
              <span>{(totalCents / 100).toFixed(2)} € {remaining !== 0 && `(reste ${(remaining / 100).toFixed(2)} €)`}</span>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setStep('plan')}
                className="flex-1 bg-gray-100 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-200 text-sm transition-colors">
                ← Retour
              </button>
              <button onClick={handleSubmit} disabled={submitting || Math.abs(remaining) > 0}
                className="flex-[2] bg-green-600 text-white font-semibold py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm transition-colors">
                {submitting ? 'Création…' : 'Créer et approuver'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
