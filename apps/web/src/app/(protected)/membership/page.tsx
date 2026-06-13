'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, addDoc, doc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

interface Season { id: string; label: string; }
interface PricingPlan { id: string; label: string; amount: number; conditions: string; seasonId: string; }
interface Membership {
  id: string;
  pricingPlanId: string;
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
  status: string;
}

type PaymentMethod = 'cheque' | 'transfer' | 'cash';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cheque: 'Chèque',
  transfer: 'Virement',
  cash: 'Espèces',
};

export default function MembershipPage() {
  const { user } = useAuth();
  const [season, setSeason] = useState<Season | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);
  const [planDetail, setPlanDetail] = useState<PricingPlan | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('cheque');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const seasonsSnap = await getDocs(query(collection(db, 'seasons'), where('isActive', '==', true)));
      if (seasonsSnap.empty) { setLoading(false); return; }
      const activeSeason = { id: seasonsSnap.docs[0].id, label: seasonsSnap.docs[0].data().label };
      setSeason(activeSeason);

      const [plansSnap, membershipSnap] = await Promise.all([
        getDocs(query(collection(db, 'pricingPlans'),
          where('seasonId', '==', activeSeason.id),
          where('isActive', '==', true))),
        getDocs(query(collection(db, 'memberships'),
          where('userId', '==', user.uid),
          where('seasonId', '==', activeSeason.id))),
      ]);

      const loadedPlans = plansSnap.docs.map(d => ({
        id: d.id, label: d.data().label, amount: d.data().amount,
        conditions: d.data().conditions ?? '', seasonId: d.data().seasonId,
      }));
      setPlans(loadedPlans);

      if (!membershipSnap.empty) {
        const md = membershipSnap.docs[0];
        const m: Membership = { id: md.id, ...md.data() as Omit<Membership, 'id'> };
        setMembership(m);
        const plan = loadedPlans.find(p => p.id === m.pricingPlanId);
        if (plan) setPlanDetail(plan);
        else {
          const planSnap = await getDoc(doc(db, 'pricingPlans', m.pricingPlanId));
          if (planSnap.exists()) {
            setPlanDetail({ id: planSnap.id, ...planSnap.data() as Omit<PricingPlan, 'id'> });
          }
        }
      } else {
        setMembership(null);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const handleCreate = async () => {
    if (!user || !season || !selectedPlanId) return;
    const plan = plans.find(p => p.id === selectedPlanId);
    if (!plan) return;
    setSubmitting(true);
    await addDoc(collection(db, 'memberships'), {
      userId: user.uid,
      seasonId: season.id,
      pricingPlanId: selectedPlanId,
      totalDue: plan.amount,
      totalPaid: 0,
      paymentMethod: selectedMethod,
      paymentPlanStatus: 'pending',
      installmentIds: [],
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setSubmitting(false);
    window.location.href = '/membership/payment-plan';
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

        {season && membership === null && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="font-semibold text-gray-800 mb-1">Saison {season.label}</h2>
              <p className="text-sm text-gray-500">Choisissez un tarif et un mode de paiement pour créer votre cotisation.</p>
            </div>

            {plans.length === 0 && (
              <p className="text-sm text-gray-400">Aucun tarif disponible pour cette saison.</p>
            )}

            <div className="space-y-2">
              {plans.map(p => (
                <label key={p.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedPlanId === p.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="radio" name="plan" value={p.id} checked={selectedPlanId === p.id}
                    onChange={() => setSelectedPlanId(p.id)} className="mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{p.label}</p>
                    <p className="text-sm font-semibold text-blue-700">{(p.amount / 100).toFixed(2)} €</p>
                    {p.conditions && <p className="text-xs text-gray-500 mt-0.5">{p.conditions}</p>}
                  </div>
                </label>
              ))}
            </div>

            {selectedPlanId && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mode de paiement</p>
                <div className="flex gap-2">
                  {(['cheque', 'transfer', 'cash'] as PaymentMethod[]).map(m => (
                    <button key={m} type="button"
                      onClick={() => setSelectedMethod(m)}
                      className={`text-sm px-4 py-2 rounded-lg font-medium border transition-colors ${selectedMethod === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                      {METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleCreate} disabled={!selectedPlanId || submitting}
              className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
              {submitting ? 'Création…' : 'Créer ma cotisation'}
            </button>
          </div>
        )}

        {season && membership && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800">{planDetail?.label ?? 'Cotisation'}</h2>
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
                  <p className="font-medium text-gray-700">{METHOD_LABEL[membership.paymentMethod as PaymentMethod] ?? membership.paymentMethod}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Plan de paiement</p>
                  <p className={`font-medium ${
                    membership.paymentPlanStatus === 'approved' ? 'text-green-700' :
                    membership.paymentPlanStatus === 'rejected' ? 'text-red-600' :
                    'text-orange-600'
                  }`}>
                    {membership.paymentPlanStatus === 'approved' ? 'Approuvé' :
                     membership.paymentPlanStatus === 'rejected' ? 'Refusé' : 'En attente'}
                  </p>
                </div>
              </div>
            </div>

            {membership.paymentPlanStatus === 'pending' && membership.installmentIds.length === 0 && (
              <Link href="/membership/payment-plan"
                className="block w-full text-center bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 text-sm transition-colors">
                Proposer un plan de paiement →
              </Link>
            )}
            {membership.paymentPlanStatus === 'rejected' && (
              <Link href="/membership/payment-plan"
                className="block w-full text-center bg-orange-600 text-white font-semibold py-2.5 rounded-lg hover:bg-orange-700 text-sm transition-colors">
                Modifier le plan de paiement →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
