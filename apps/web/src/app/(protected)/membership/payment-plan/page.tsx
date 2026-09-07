'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth, useIsBureau } from '@/contexts/AuthContext';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { type Installment, emptyInstallment, nextInstallment, getMaxInstallments, canAddInstallment, methodCounts, METHOD_LABEL, chequeFields, type PaymentMethod } from '@/lib/payment-constants';
import { logEvent } from '@/lib/analytics';

// Si le danseur quitte/rafraîchit la page avant de valider, les versements
// déjà tapés ne doivent pas être perdus.
function draftKey(id: string) {
  return `paymentPlanDraft:${id}`;
}

interface Membership {
  id: string;
  pricingPlanId: string;
  totalDue: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
  seasonId: string;
  userId: string;
}

interface PaymentGroup {
  id: string;
  membershipIds: string[];
  totalDue: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
  userId: string;
  dancers: { name: string; planLabel: string }[];
}

export default function PaymentPlanPage() {
  const { user } = useAuth();
  const isBureau = useIsBureau();
  const searchParams = useSearchParams();
  const membershipId = searchParams.get('membershipId');
  const groupId = searchParams.get('groupId');

  const [membership, setMembership] = useState<Membership | null>(null);
  const [group, setGroup] = useState<PaymentGroup | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([emptyInstallment()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      if (groupId) {
        const snap = await getDoc(doc(db, 'paymentGroups', groupId));
        if (snap.exists()) {
          const data = snap.data();
          const membershipIds: string[] = data.membershipIds ?? [];
          const dancers = await Promise.all(
            membershipIds.map(async (mid) => {
              const mSnap = await getDoc(doc(db, 'memberships', mid));
              if (!mSnap.exists()) return { name: '—', planLabel: '—' };
              const md = mSnap.data();
              let name = '—';
              if (md.dancerId) {
                const dSnap = await getDoc(doc(db, 'dancers', md.dancerId));
                if (dSnap.exists()) name = `${dSnap.data().firstName} ${dSnap.data().lastName}`.trim();
              }
              let planLabel = '—';
              if (md.pricingPlanId) {
                const pSnap = await getDoc(doc(db, 'pricingPlans', md.pricingPlanId));
                if (pSnap.exists()) planLabel = pSnap.data().label;
              }
              return { name, planLabel };
            })
          );
          setGroup({
            id: snap.id, membershipIds,
            totalDue: data.totalDue, paymentMethod: data.paymentMethod,
            paymentPlanStatus: data.paymentPlanStatus,
            installmentIds: data.installmentIds ?? [],
            userId: data.userId, dancers,
          });
        }
      } else if (membershipId) {
        const snap = await getDoc(doc(db, 'memberships', membershipId));
        if (snap.exists()) {
          setMembership({ id: snap.id, ...snap.data() as Omit<Membership, 'id'> });
        }
      } else {
        const seasonsSnap = await getDocs(query(collection(db, 'seasons'), where('isActive', '==', true)));
        if (seasonsSnap.empty) { setLoading(false); return; }
        const seasonId = seasonsSnap.docs[0]!.id;
        const snap = await getDocs(query(collection(db, 'memberships'),
          where('userId', '==', user.uid),
          where('seasonId', '==', seasonId)));
        if (!snap.empty) {
          setMembership({ id: snap.docs[0]!.id, ...snap.docs[0]!.data() as Omit<Membership, 'id'> });
        }
      }
      setLoading(false);
    };
    load();
  }, [user, membershipId, groupId]);

  const entityId = group?.id ?? membership?.id ?? null;

  // Restaure les versements déjà tapés lors d'une précédente visite.
  useEffect(() => {
    if (!entityId) return;
    try {
      const raw = localStorage.getItem(draftKey(entityId));
      if (!raw) return;
      const draft = JSON.parse(raw) as Installment[];
      if (Array.isArray(draft) && draft.length > 0) setInstallments(draft);
    } catch { /* brouillon illisible, on garde la valeur par défaut */ }
  }, [entityId]);

  // Sauvegarde locale au fil de la saisie.
  useEffect(() => {
    if (!entityId) return;
    try {
      localStorage.setItem(draftKey(entityId), JSON.stringify(installments));
    } catch { /* stockage indisponible (navigation privée, quota...) */ }
  }, [entityId, installments]);

  const totalDue = group?.totalDue ?? membership?.totalDue ?? 0;
  const paymentMethod = group?.paymentMethod ?? membership?.paymentMethod ?? '';

  const maxInstallments = getMaxInstallments(paymentMethod as PaymentMethod, isBureau);

  const totalCents = installments.reduce((sum, i) => {
    const v = parseFloat(i.amount);
    return sum + (isNaN(v) ? 0 : Math.round(v * 100));
  }, 0);
  const remaining = totalDue - totalCents;

  const handleSubmit = async () => {
    if (!user || (!membership && !group)) return;
    setError(null);

    const submitCounts = methodCounts(installments, paymentMethod as PaymentMethod);
    const overCapMethod = (['cheque', 'transfer', 'cash', 'helloasso'] as PaymentMethod[])
      .find(m => (submitCounts[m] ?? 0) > getMaxInstallments(m, isBureau));
    if (overCapMethod) {
      const cap = getMaxInstallments(overCapMethod, isBureau);
      setError(`Maximum ${cap} versement${cap > 1 ? 's' : ''} en ${METHOD_LABEL[overCapMethod].toLowerCase()}.`);
      return;
    }
    if (Math.abs(remaining) > 0) {
      setError(`Le total des versements (${(totalCents / 100).toFixed(2)} €) doit être égal au montant dû (${(totalDue / 100).toFixed(2)} €).`);
      return;
    }
    for (const i of installments) {
      if (!i.expectedDate || !i.amount || parseFloat(i.amount) <= 0) {
        setError('Tous les versements doivent avoir une date et un montant valide.');
        return;
      }
    }

    setSaving(true);
    const batch = writeBatch(db);
    const ids: string[] = [];
    const usedMethods = new Set(installments.map(i => i.method ?? (paymentMethod as PaymentMethod)));
    const planPaymentMethod: PaymentMethod | 'mixed' = usedMethods.size === 1 ? [...usedMethods][0]! : 'mixed';

    if (group) {
      for (const i of installments) {
        const instMethod = i.method ?? (paymentMethod as PaymentMethod);
        const ref = doc(collection(db, 'paymentInstallments'));
        ids.push(ref.id);
        batch.set(ref, {
          paymentGroupId: group.id,
          userId: user.uid,
          amount: Math.round(parseFloat(i.amount) * 100),
          method: instMethod,
          expectedDate: i.expectedDate,
          status: 'pending',
          ...chequeFields(instMethod, i),
        });
      }
      batch.update(doc(db, 'paymentGroups', group.id), {
        installmentIds: ids,
        paymentMethod: planPaymentMethod,
        updatedAt: serverTimestamp(),
      });
    } else if (membership) {
      for (const i of installments) {
        const instMethod = i.method ?? (paymentMethod as PaymentMethod);
        const ref = doc(collection(db, 'paymentInstallments'));
        ids.push(ref.id);
        batch.set(ref, {
          membershipId: membership.id,
          userId: user.uid,
          amount: Math.round(parseFloat(i.amount) * 100),
          method: instMethod,
          expectedDate: i.expectedDate,
          status: 'pending',
          ...chequeFields(instMethod, i),
        });
      }
      batch.update(doc(db, 'memberships', membership.id), {
        installmentIds: ids,
        paymentMethod: planPaymentMethod,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    if (entityId) {
      try { localStorage.removeItem(draftKey(entityId)); } catch { /* ignore */ }
    }
    if (user) logEvent('membership_completed', { userId: user.uid });
    setSaving(false);
    window.location.href = '/membership';
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement…</p>
    </div>
  );

  if (!membership && !group) return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-10">
        <p className="text-gray-400">Aucune cotisation trouvée. <Link href="/membership" className="text-blue-600 underline">Créer une cotisation</Link></p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-10">
        <Link href="/membership" className="text-sm text-gray-400 hover:text-gray-700 mb-6 inline-block">← Cotisation</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Plan de paiement</h1>
        <p className="text-sm text-gray-500 mb-6">
          Montant total : <span className="font-semibold text-gray-800">{(totalDue / 100).toFixed(2)} €</span>
        </p>

        {group && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Danseurs inclus</p>
            <div className="space-y-1">
              {group.dancers.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-900">{d.name}</span>
                  <span className="text-gray-500">{d.planLabel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          {installments.map((inst, idx) => (
            <div key={idx} className="space-y-2 pb-3 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-gray-400 w-6">{idx + 1}.</span>
                <input
                  type="date"
                  value={inst.expectedDate}
                  onChange={e => setInstallments(prev => prev.map((x, i) => i === idx ? { ...x, expectedDate: e.target.value } : x))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <div className="relative w-32">
                  <input
                    type="number" step="0.01" min="0"
                    value={inst.amount}
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
              {isBureau && (
                <div className="ml-8 flex gap-1.5">
                  {(['cheque', 'transfer', 'cash'] as PaymentMethod[]).map(m => (
                    <button key={m} type="button"
                      onClick={() => setInstallments(prev => prev.map((x, i) => i === idx ? { ...x, method: m } : x))}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium border transition-colors ${(inst.method ?? paymentMethod) === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                      {METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              )}
              {(inst.method ?? paymentMethod) === 'cheque' && (
                <div className="ml-8 grid grid-cols-3 gap-2">
                  <input
                    type="text" placeholder="N° chèque"
                    value={inst.chequeNumber ?? ''}
                    onChange={e => setInstallments(prev => prev.map((x, i) => i === idx ? { ...x, chequeNumber: e.target.value } : x))}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <input
                    type="text" placeholder="Banque"
                    value={inst.draweeBank ?? ''}
                    onChange={e => setInstallments(prev => prev.map((x, i) => i === idx ? { ...x, draweeBank: e.target.value } : x))}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <input
                    type="text" placeholder="Ville"
                    value={inst.draweeCity ?? ''}
                    onChange={e => setInstallments(prev => prev.map((x, i) => i === idx ? { ...x, draweeCity: e.target.value } : x))}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              )}
            </div>
          ))}

          {(() => {
            const counts = methodCounts(installments, paymentMethod as PaymentMethod);
            const breakdown = isBureau
              ? (['cheque', 'transfer', 'cash', 'helloasso'] as PaymentMethod[])
                  .filter(m => counts[m])
                  .map(m => `${counts[m]} ${METHOD_LABEL[m].toLowerCase()}${counts[m]! > 1 ? 's' : ''}`)
                  .join(' + ')
              : '';
            const canAdd = isBureau
              ? canAddInstallment(installments, paymentMethod as PaymentMethod, true)
              : installments.length < maxInstallments;
            return (
              <div className="flex items-center justify-between">
                <button type="button"
                  onClick={() => setInstallments(prev => [...prev, nextInstallment(prev, isBureau)])}
                  disabled={!canAdd}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                  + Ajouter un versement
                </button>
                <span className="text-xs text-gray-400">
                  {breakdown || `${installments.length}/${maxInstallments} versement${maxInstallments > 1 ? 's' : ''}`}
                </span>
              </div>
            );
          })()}

          <div className={`flex justify-between items-center text-sm font-semibold pt-2 border-t border-gray-100 ${Math.abs(remaining) > 0 ? 'text-orange-600' : 'text-green-700'}`}>
            <span>Total saisi</span>
            <span>{(totalCents / 100).toFixed(2)} € {remaining !== 0 && `(reste ${(remaining / 100).toFixed(2)} €)`}</span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button onClick={handleSubmit} disabled={saving || Math.abs(remaining) > 0}
            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
            {saving ? 'Envoi…' : 'Soumettre le plan de paiement'}
          </button>
        </div>
      </div>
    </div>
  );
}
