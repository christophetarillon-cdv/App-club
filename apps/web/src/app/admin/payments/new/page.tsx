'use client';

import { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, query, where, doc, getDoc, setDoc, increment,
  serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

interface Account { id: string; displayName: string; email: string; dancerIds: string[]; dancerName: string; allDancerNames: string[]; }

interface Plan {
  id: string;
  kind: 'solo' | 'group';
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  seasonId: string;
  installmentIds: string[];
  paymentPlanStatus: string;
  label: string;
}

interface Installment { id: string; expectedDate: string; amount: number; status: string; }
interface Season { id: string; label: string; }

export default function AdminNewPaymentPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState('');
  const [amount, setAmount] = useState('');
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [chequePreviewUrl, setChequePreviewUrl] = useState<string | null>(null);
  const [chequeNumber, setChequeNumber] = useState('');
  const [draweeBank, setDraweeBank] = useState('');
  const [draweeCity, setDraweeCity] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [cashReceiptRef, setCashReceiptRef] = useState('');
  const [cashDate, setCashDate] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmOverpay, setConfirmOverpay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'accounts')),
      getDocs(query(collection(db, 'seasons'), where('isActive', '==', true))),
      getDocs(collection(db, 'dancers')),
    ]).then(([accSnap, seasonSnap, dancerSnap]) => {
      const dancerMap = new Map<string, { firstName: string; lastName: string }>();
      dancerSnap.docs.forEach(d => {
        dancerMap.set(d.id, { firstName: d.data().firstName ?? '', lastName: d.data().lastName ?? '' });
      });
      setAccounts(accSnap.docs.map(d => {
        const data = d.data();
        const dancerIds: string[] = data.dancerIds ?? [];
        const allDancerNames = dancerIds.map(id => {
          const dancer = dancerMap.get(id);
          return dancer ? `${dancer.firstName} ${dancer.lastName}`.trim() : '';
        }).filter(Boolean);
        const dancerName = allDancerNames[0] ?? (data.displayName ?? '');
        return { id: d.id, displayName: data.displayName, email: data.email, dancerIds, dancerName, allDancerNames };
      }));
      setSeasons(seasonSnap.docs.map(d => ({ id: d.id, label: d.data().label })));
    });
  }, []);

  const filteredAccounts = search.length >= 2
    ? accounts.filter(a => {
        const lower = search.toLowerCase();
        return a.allDancerNames.some(n => n.toLowerCase().includes(lower)) || a.email?.toLowerCase().includes(lower);
      })
    : [];

  const seasonLabel = (id: string) => seasons.find(s => s.id === id)?.label ?? id;

  const handleSelectUser = async (acc: Account, matchedName?: string) => {
    setSelectedUserId(acc.id);
    setSearch(matchedName || acc.dancerName || acc.displayName || acc.email);
    setSelectedPlanId('');
    setSelectedPlan(null);
    setInstallments([]);
    setAmount('');

    const [membershipSnap, groupSnap] = await Promise.all([
      getDocs(query(collection(db, 'memberships'), where('userId', '==', acc.id))),
      getDocs(query(collection(db, 'paymentGroups'), where('userId', '==', acc.id))),
    ]);

    const allPlans: Plan[] = [];

    // Solo memberships (not part of a group)
    membershipSnap.docs.forEach(d => {
      if (d.data().paymentGroupId) return;
      const data = d.data();
      allPlans.push({
        id: d.id,
        kind: 'solo',
        totalDue: data.totalDue ?? 0,
        totalPaid: data.totalPaid ?? 0,
        paymentMethod: data.paymentMethod ?? '',
        seasonId: data.seasonId ?? '',
        installmentIds: data.installmentIds ?? [],
        paymentPlanStatus: data.paymentPlanStatus ?? '',
        label: `${seasonLabel(data.seasonId)} — ${((data.totalDue ?? 0) / 100).toFixed(2)} € (encaissé : ${((data.totalPaid ?? 0) / 100).toFixed(2)} €)`,
      });
    });

    // Group plans
    groupSnap.docs.forEach(d => {
      const data = d.data();
      allPlans.push({
        id: d.id,
        kind: 'group',
        totalDue: data.totalDue ?? 0,
        totalPaid: data.totalPaid ?? 0,
        paymentMethod: data.paymentMethod ?? '',
        seasonId: data.seasonId ?? '',
        installmentIds: data.installmentIds ?? [],
        paymentPlanStatus: data.paymentPlanStatus ?? '',
        label: `${seasonLabel(data.seasonId)} — Groupe — ${((data.totalDue ?? 0) / 100).toFixed(2)} € (encaissé : ${((data.totalPaid ?? 0) / 100).toFixed(2)} €)`,
      });
    });

    setPlans(allPlans);
  };

  const handleSelectPlan = async (planId: string) => {
    setSelectedPlanId(planId);
    const plan = plans.find(p => p.id === planId);
    setSelectedPlan(plan ?? null);
    setInstallments([]);
    setSelectedInstallmentId('');
    setConfirmOverpay(false);

    if (plan && plan.installmentIds.length > 0) {
      const insts = await Promise.all(
        plan.installmentIds.map(async id => {
          const snap = await getDoc(doc(db, 'paymentInstallments', id));
          return snap.exists() ? { id, expectedDate: snap.data().expectedDate, amount: snap.data().amount, status: snap.data().status } : null;
        })
      );
      setInstallments(insts.filter(Boolean) as Installment[]);
    }
  };

  const handleChequeFile = (file: File | null) => {
    setChequeFile(file);
    if (chequePreviewUrl) URL.revokeObjectURL(chequePreviewUrl);
    setChequePreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleSelectInstallment = (instId: string) => {
    setSelectedInstallmentId(instId);
    const inst = installments.find(i => i.id === instId);
    if (inst) setAmount((inst.amount / 100).toFixed(2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedUserId || !selectedPlanId || !selectedPlan) return;
    setError(null);

    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) { setError('Montant invalide'); return; }

    if (selectedPlan.totalPaid + amountCents > selectedPlan.totalDue && !confirmOverpay) {
      setError("Ce montant dépasse ce qui reste dû sur cette cotisation. Cochez la case de confirmation ci-dessous si c'est volontaire (sinon, vérifiez qu'un paiement n'a pas déjà été saisi pour cette échéance).");
      return;
    }

    setSaving(true);

    try {
      let chequeImageId: string | undefined;

      if (chequeFile) {
        const newImageRef = doc(collection(db, 'chequeImages'));
        chequeImageId = newImageRef.id;
        const storageRef = ref(storage, `cheques/${chequeImageId}`);
        await uploadBytes(storageRef, chequeFile);
        await setDoc(newImageRef, {
          installmentId: selectedInstallmentId || null,
          storagePath: `cheques/${chequeImageId}`,
          uploadedBy: user.uid,
          uploadedAt: serverTimestamp(),
          ocrProcessedAt: null,
          ...(chequeNumber ? { chequeNumber } : {}),
          ...(draweeBank ? { draweeBank } : {}),
          ...(draweeCity ? { draweeCity } : {}),
        });
      }

      const batch = writeBatch(db);
      const method = selectedPlan.paymentMethod;

      const paymentRef = doc(collection(db, 'payments'));
      batch.set(paymentRef, {
        userId: selectedUserId,
        amount: amountCents,
        provider: 'manual',
        status: 'paid',
        ...(selectedPlan.kind === 'group'
          ? { relatedGroupId: selectedPlanId }
          : { relatedMembershipId: selectedPlanId }),
        notes: notes || null,
        recordedBy: user.uid,
        createdAt: serverTimestamp(),
      });

      if (selectedInstallmentId) {
        batch.update(doc(db, 'paymentInstallments', selectedInstallmentId), {
          status: 'paid',
          actualDate: new Date().toISOString().slice(0, 10),
          ...(method === 'cheque' && chequeImageId ? { chequeImageId } : {}),
          ...(method === 'cheque' && chequeNumber ? { chequeNumber } : {}),
          ...(method === 'cheque' && draweeBank ? { draweeBank } : {}),
          ...(method === 'cheque' && draweeCity ? { draweeCity } : {}),
          ...(method === 'transfer' && transferRef ? { transferRef } : {}),
          ...(method === 'transfer' && transferDate ? { transferDate } : {}),
          ...(method === 'cash' && cashReceiptRef ? { cashReceiptRef } : {}),
          ...(method === 'cash' && cashDate ? { cashDate } : {}),
        });
      }

      const targetCollection = selectedPlan.kind === 'group' ? 'paymentGroups' : 'memberships';
      batch.update(doc(db, targetCollection, selectedPlanId), {
        totalPaid: increment(amountCents),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      setSuccess(true);
      setAmount(''); setChequeFile(null); setChequeNumber(''); setDraweeBank(''); setDraweeCity('');
      setTransferRef(''); setTransferDate(''); setCashReceiptRef(''); setCashDate(''); setNotes(''); setConfirmOverpay(false);
      if (chequePreviewUrl) URL.revokeObjectURL(chequePreviewUrl);
      setChequePreviewUrl(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la saisie du paiement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/courses" className="text-sm text-gray-400 hover:text-gray-700">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900">Saisir un paiement</h1>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-green-700 font-medium">Paiement enregistré.</p>
          <button onClick={() => setSuccess(false)} className="text-xs text-green-600 underline mt-1">Saisir un autre</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
        {/* User search */}
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Membre</label>
          <input
            type="text" value={search}
            onChange={e => { setSearch(e.target.value); setSelectedUserId(''); }}
            placeholder="Rechercher par prénom nom ou email…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          {filteredAccounts.length > 0 && !selectedUserId && (
            <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {filteredAccounts.slice(0, 10).map(a => {
                const lower = search.toLowerCase();
                const matchedName = a.allDancerNames.find(n => n.toLowerCase().includes(lower)) || a.dancerName || a.displayName;
                return (
                  <button key={a.id} type="button" onClick={() => handleSelectUser(a, matchedName)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50">
                    <span className="font-medium text-gray-900">{matchedName}</span>
                    {a.allDancerNames.length > 1 && (
                      <span className="text-gray-400 ml-1.5 text-xs">({a.allDancerNames.join(', ')})</span>
                    )}
                    <span className="text-gray-400 ml-2">{a.email}</span>
                  </button>
                );
              })}
              {filteredAccounts.length > 10 && (
                <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
                  {filteredAccounts.length - 10} résultat(s) masqué(s) — affinez la recherche
                </div>
              )}
            </div>
          )}
        </div>

        {/* Plan select */}
        {plans.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cotisation</label>
            <select value={selectedPlanId} onChange={e => handleSelectPlan(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
              <option value="">Choisir…</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Installment select */}
        {installments.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Versement (optionnel)</label>
            <select value={selectedInstallmentId} onChange={e => handleSelectInstallment(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
              <option value="">— Sans versement spécifique —</option>
              {installments.map((inst, idx) => (
                <option key={inst.id} value={inst.id} disabled={inst.status === 'paid'}>
                  Versement {idx + 1} — {inst.expectedDate} — {(inst.amount / 100).toFixed(2)} €{inst.status === 'paid' ? ' (déjà payé)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Amount */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Montant (€)</label>
          <input type="number" step="0.01" min="0" value={amount}
            onChange={e => { setAmount(e.target.value); setConfirmOverpay(false); }} required placeholder="0.00"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>

        {/* Avertissement dépassement du montant dû */}
        {selectedPlan && (() => {
          const amountCents = Math.round((parseFloat(amount) || 0) * 100);
          const projected = selectedPlan.totalPaid + amountCents;
          if (amountCents <= 0 || projected <= selectedPlan.totalDue) return null;
          return (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 space-y-2">
              <p className="text-sm text-orange-800">
                ⚠️ Ce paiement porterait le total encaissé à {(projected / 100).toFixed(2)} €, au-delà du montant dû
                ({(selectedPlan.totalDue / 100).toFixed(2)} €). Vérifiez qu'un paiement n'a pas déjà été saisi pour cette échéance.
              </p>
              <label className="flex items-center gap-2 text-sm text-orange-800">
                <input type="checkbox" checked={confirmOverpay} onChange={e => setConfirmOverpay(e.target.checked)} />
                Je confirme, ce dépassement est volontaire
              </label>
            </div>
          );
        })()}

        {/* Cheque upload + infos */}
        {selectedPlan?.paymentMethod === 'cheque' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photo du chèque (optionnel)</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => handleChequeFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {chequePreviewUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                  <img src={chequePreviewUrl} alt="aperçu chèque" className="w-full max-h-48 object-contain" />
                  <button
                    type="button"
                    onClick={() => handleChequeFile(null)}
                    className="absolute top-2 right-2 bg-white/90 text-gray-600 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold shadow hover:bg-white"
                  >✕</button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="absolute bottom-2 right-2 bg-white/90 text-xs text-gray-600 rounded-lg px-2 py-1 shadow hover:bg-white"
                  >Reprendre</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-300 rounded-xl py-6 flex flex-col items-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                  </svg>
                  <span className="text-sm font-medium">Prendre une photo du chèque</span>
                  <span className="text-xs">ou sélectionner depuis la galerie</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">N° chèque <span className="normal-case font-normal text-gray-400">(optionnel)</span></label>
                <input type="text" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)}
                  placeholder="ex : 0012345"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Banque <span className="normal-case font-normal text-gray-400">(optionnel)</span></label>
                <input type="text" value={draweeBank} onChange={e => setDraweeBank(e.target.value)}
                  placeholder="ex : Crédit Mutuel"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ville <span className="normal-case font-normal text-gray-400">(optionnel)</span></label>
                <input type="text" value={draweeCity} onChange={e => setDraweeCity(e.target.value)}
                  placeholder="ex : Grenoble"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            </div>
          </>
        )}

        {/* Virement */}
        {selectedPlan?.paymentMethod === 'transfer' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Référence virement <span className="normal-case font-normal text-gray-400">(optionnel)</span></label>
              <input type="text" value={transferRef} onChange={e => setTransferRef(e.target.value)}
                placeholder="ex : VIR-2026-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date de réception <span className="normal-case font-normal text-gray-400">(optionnel)</span></label>
              <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          </div>
        )}

        {/* Espèces */}
        {selectedPlan?.paymentMethod === 'cash' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">N° reçu <span className="normal-case font-normal text-gray-400">(optionnel)</span></label>
              <input type="text" value={cashReceiptRef} onChange={e => setCashReceiptRef(e.target.value)}
                placeholder="ex : RECU-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date de remise <span className="normal-case font-normal text-gray-400">(optionnel)</span></label>
              <input type="date" value={cashDate} onChange={e => setCashDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes (optionnel)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex : Chèque n° 1234567"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={saving || !selectedUserId || !selectedPlanId}
          className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
          {saving ? 'Enregistrement…' : 'Enregistrer le paiement'}
        </button>
      </form>
    </div>
  );
}
