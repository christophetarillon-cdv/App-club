'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, doc, getDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Membership {
  id: string;
  userId: string;
  seasonId: string;
  pricingPlanId: string;
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
  status: string;
}

interface Installment {
  id: string;
  expectedDate: string;
  amount: number;
  status: string;
}

interface Row extends Membership {
  displayName: string;
  email: string;
  seasonLabel: string;
  planLabel: string;
  installments: Installment[];
}

const METHOD_LABEL: Record<string, string> = { cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces' };

export default function AdminPaymentPlansPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [actionId, setActionId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(query(collection(db, 'memberships'), where('paymentPlanStatus', '==', filter)));
    const mems = snap.docs.map(d => ({ id: d.id, ...d.data() as Omit<Membership, 'id'> }));

    const enriched = await Promise.all(mems.map(async (m) => {
      const [accountSnap, seasonSnap, planSnap] = await Promise.all([
        getDoc(doc(db, 'accounts', m.userId)),
        getDoc(doc(db, 'seasons', m.seasonId)),
        getDoc(doc(db, 'pricingPlans', m.pricingPlanId)),
      ]);

      const installments: Installment[] = await Promise.all(
        (m.installmentIds ?? []).map(async (id) => {
          const iSnap = await getDoc(doc(db, 'paymentInstallments', id));
          return iSnap.exists()
            ? { id, expectedDate: iSnap.data().expectedDate, amount: iSnap.data().amount, status: iSnap.data().status }
            : { id, expectedDate: '', amount: 0, status: 'unknown' };
        })
      );

      return {
        ...m,
        displayName: accountSnap.exists() ? accountSnap.data().displayName : m.userId,
        email: accountSnap.exists() ? accountSnap.data().email : '—',
        seasonLabel: seasonSnap.exists() ? seasonSnap.data().label : m.seasonId,
        planLabel: planSnap.exists() ? planSnap.data().label : m.pricingPlanId,
        installments,
      };
    }));

    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleApprove = async (row: Row) => {
    setActionId(row.id);
    await updateDoc(doc(db, 'memberships', row.id), {
      paymentPlanStatus: 'approved',
      status: 'active',
      updatedAt: serverTimestamp(),
    });
    setActionId(null);
    setRows(prev => prev.filter(r => r.id !== row.id));
  };

  const handleReject = async (row: Row) => {
    if (!confirm(`Rejeter le plan de ${row.displayName} ?`)) return;
    setActionId(row.id);
    await updateDoc(doc(db, 'memberships', row.id), {
      paymentPlanStatus: 'rejected',
      updatedAt: serverTimestamp(),
    });
    setActionId(null);
    setRows(prev => prev.filter(r => r.id !== row.id));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Plans de paiement</h1>

      <div className="flex gap-2 mb-4">
        {(['pending', 'approved', 'rejected'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvés' : 'Rejetés'}
          </button>
        ))}
      </div>

      {loading ? <p className="text-gray-500 text-sm">Chargement…</p> : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
          <p className="text-gray-400 text-sm">Aucun plan de paiement.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <div key={row.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{row.displayName}</p>
                    <span className="text-xs text-gray-400">{row.email}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{row.planLabel} · {row.seasonLabel}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    {(row.totalDue / 100).toFixed(2)} € · {METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod}
                    {row.installmentIds.length > 0 && ` · ${row.installmentIds.length} versement${row.installmentIds.length > 1 ? 's' : ''}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {filter === 'pending' && (
                    <>
                      <button onClick={() => handleApprove(row)} disabled={actionId === row.id}
                        className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                        {actionId === row.id ? '…' : 'Approuver'}
                      </button>
                      <button onClick={() => handleReject(row)} disabled={actionId === row.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
                        Rejeter
                      </button>
                    </>
                  )}
                  {row.installments.length > 0 && (
                    <button onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                      className="text-xs text-gray-400 hover:text-gray-700">
                      {expanded === row.id ? 'Masquer' : 'Détail'}
                    </button>
                  )}
                </div>
              </div>
              {expanded === row.id && row.installments.length > 0 && (
                <div className="border-t border-gray-100 px-5 py-3 space-y-1">
                  {row.installments.map((inst, idx) => (
                    <div key={inst.id} className="flex justify-between text-sm text-gray-600">
                      <span>Versement {idx + 1} — {inst.expectedDate}</span>
                      <span className="font-medium">{(inst.amount / 100).toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
