'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

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

interface Installment {
  expectedDate: string;
  amount: string;
}

const emptyInstallment = (): Installment => ({ expectedDate: '', amount: '' });

export default function PaymentPlanPage() {
  const { user } = useAuth();
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

  const totalDue = group?.totalDue ?? membership?.totalDue ?? 0;
  const paymentMethod = group?.paymentMethod ?? membership?.paymentMethod ?? '';

  const maxInstallments = paymentMethod === 'cheque' ? 10 : 1;

  const totalCents = installments.reduce((sum, i) => {
    const v = parseFloat(i.amount);
    return sum + (isNaN(v) ? 0 : Math.round(v * 100));
  }, 0);
  const remaining = totalDue - totalCents;

  const handleSubmit = async () => {
    if (!user || (!membership && !group)) return;
    setError(null);

    if (installments.length > maxInstallments) {
      setError(`Maximum ${maxInstallments} versement${maxInstallments > 1 ? 's' : ''} autorisé${maxInstallments > 1 ? 's' : ''} pour ce mode de paiement.`);
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

    if (group) {
      for (const i of installments) {
        const ref = doc(collection(db, 'paymentInstallments'));
        ids.push(ref.id);
        batch.set(ref, {
          paymentGroupId: group.id,
          userId: user.uid,
          amount: Math.round(parseFloat(i.amount) * 100),
          method: paymentMethod,
          expectedDate: i.expectedDate,
          status: 'pending',
        });
      }
      batch.update(doc(db, 'paymentGroups', group.id), {
        installmentIds: ids,
        updatedAt: serverTimestamp(),
      });
    } else if (membership) {
      for (const i of installments) {
        const ref = doc(collection(db, 'paymentInstallments'));
        ids.push(ref.id);
        batch.set(ref, {
          membershipId: membership.id,
          userId: user.uid,
          amount: Math.round(parseFloat(i.amount) * 100),
          method: membership.paymentMethod,
          expectedDate: i.expectedDate,
          status: 'pending',
        });
      }
      batch.update(doc(db, 'memberships', membership.id), {
        installmentIds: ids,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
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
            <div key={idx} className="flex items-center gap-3">
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
          ))}

          <div className="flex items-center justify-between">
            <button type="button"
              onClick={() => setInstallments(prev => [...prev, emptyInstallment()])}
              disabled={installments.length >= maxInstallments}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              + Ajouter un versement
            </button>
            <span className="text-xs text-gray-400">
              {installments.length}/{maxInstallments} versement{maxInstallments > 1 ? 's' : ''}
            </span>
          </div>

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
