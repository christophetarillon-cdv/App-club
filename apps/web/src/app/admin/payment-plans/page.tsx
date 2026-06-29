'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, doc, getDoc, updateDoc, writeBatch, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';

interface Membership {
  id: string;
  userId: string;
  dancerId?: string;
  seasonId: string;
  pricingPlanId: string;
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
  status: string;
  paymentGroupId?: string;
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
  dancerName: string;
  resolvedDancerId?: string;
  seasonLabel: string;
  planLabel: string;
  installments: Installment[];
}

interface PaymentGroupDoc {
  id: string;
  userId: string;
  seasonId: string;
  membershipIds: string[];
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
}

interface GroupRow extends PaymentGroupDoc {
  displayName: string;
  email: string;
  seasonLabel: string;
  dancers: { name: string; planLabel: string }[];
  dancerIds: string[];
  installments: Installment[];
}

const METHOD_LABEL: Record<string, string> = { cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces' };

export default function AdminPaymentPlansPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [actionId, setActionId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const load = async () => {
    setLoading(true);

    // Solo memberships (not part of a group)
    const snap = await getDocs(query(collection(db, 'memberships'), where('paymentPlanStatus', '==', filter)));
    const mems = snap.docs
      .map(d => ({ id: d.id, ...d.data() as Omit<Membership, 'id'> }))
      .filter(m => !m.paymentGroupId);

    const enriched = await Promise.all(mems.map(async (m) => {
      const [accountSnap, seasonSnap, planSnap] = await Promise.all([
        getDoc(doc(db, 'accounts', m.userId)),
        getDoc(doc(db, 'seasons', m.seasonId)),
        getDoc(doc(db, 'pricingPlans', m.pricingPlanId)),
      ]);

      let dancerName = '';
      const dancerId = m.dancerId
        ?? (accountSnap.exists() ? (accountSnap.data().dancerIds as string[] ?? [])[0] : undefined);
      if (dancerId) {
        const dancerSnap = await getDoc(doc(db, 'dancers', dancerId));
        if (dancerSnap.exists()) {
          dancerName = `${dancerSnap.data().firstName ?? ''} ${dancerSnap.data().lastName ?? ''}`.trim();
        }
      }

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
        dancerName,
        resolvedDancerId: dancerId,
        seasonLabel: seasonSnap.exists() ? seasonSnap.data().label : m.seasonId,
        planLabel: planSnap.exists() ? planSnap.data().label : m.pricingPlanId,
        installments,
      };
    }));
    setRows(enriched);

    // Payment groups
    const groupSnap = await getDocs(query(collection(db, 'paymentGroups'), where('paymentPlanStatus', '==', filter)));
    const groups = groupSnap.docs.map(d => ({ id: d.id, ...d.data() as Omit<PaymentGroupDoc, 'id'> }));

    const enrichedGroups = await Promise.all(groups.map(async (g) => {
      const [accountSnap, seasonSnap] = await Promise.all([
        getDoc(doc(db, 'accounts', g.userId)),
        getDoc(doc(db, 'seasons', g.seasonId)),
      ]);
      const dancers = await Promise.all(
        g.membershipIds.map(async (mid) => {
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
          return { name, planLabel, dancerId: md.dancerId as string | undefined };
        })
      );
      const installments: Installment[] = await Promise.all(
        (g.installmentIds ?? []).map(async (id) => {
          const iSnap = await getDoc(doc(db, 'paymentInstallments', id));
          return iSnap.exists()
            ? { id, expectedDate: iSnap.data().expectedDate, amount: iSnap.data().amount, status: iSnap.data().status }
            : { id, expectedDate: '', amount: 0, status: 'unknown' };
        })
      );
      return {
        ...g,
        displayName: accountSnap.exists() ? accountSnap.data().displayName : g.userId,
        email: accountSnap.exists() ? accountSnap.data().email : '—',
        seasonLabel: seasonSnap.exists() ? seasonSnap.data().label : g.seasonId,
        dancers: dancers.map(d => ({ name: d.name, planLabel: d.planLabel })),
        dancerIds: dancers.map(d => d.dancerId).filter((id): id is string => !!id),
        installments,
      };
    }));
    setGroupRows(enrichedGroups);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleApprove = async (row: Row) => {
    setActionId(row.id);
    const batch = writeBatch(db);
    batch.update(doc(db, 'memberships', row.id), {
      paymentPlanStatus: 'approved',
      status: 'active',
      updatedAt: serverTimestamp(),
    });
    if (row.resolvedDancerId && row.seasonId) {
      batch.update(doc(db, 'dancers', row.resolvedDancerId), {
        validatedSeasonIds: arrayUnion(row.seasonId),
      });
    }
    await batch.commit();
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

  const handleApproveGroup = async (g: GroupRow) => {
    setActionId(g.id);
    const batch = writeBatch(db);
    for (const mid of g.membershipIds) {
      batch.update(doc(db, 'memberships', mid), {
        paymentPlanStatus: 'approved',
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    }
    for (const dancerId of g.dancerIds) {
      batch.update(doc(db, 'dancers', dancerId), {
        validatedSeasonIds: arrayUnion(g.seasonId),
      });
    }
    batch.update(doc(db, 'paymentGroups', g.id), {
      paymentPlanStatus: 'approved',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    setActionId(null);
    setGroupRows(prev => prev.filter(r => r.id !== g.id));
  };

  // Backfill validatedSeasonIds sur les danseurs à partir des adhésions déjà approuvées
  const handleBackfill = async () => {
    if (!confirm('Synchroniser validatedSeasonIds pour toutes les adhésions approuvées ?')) return;
    setBackfilling(true);
    try {
      const snap = await getDocs(query(collection(db, 'memberships'), where('paymentPlanStatus', '==', 'approved')));
      const batch = writeBatch(db);
      let count = 0;
      for (const mDoc of snap.docs) {
        const m = mDoc.data();
        const seasonId = m.seasonId as string | undefined;
        if (!seasonId) continue;
        let dancerId = m.dancerId as string | undefined;
        if (!dancerId) {
          const accountSnap = await getDoc(doc(db, 'accounts', m.userId));
          if (accountSnap.exists()) {
            dancerId = (accountSnap.data().dancerIds as string[] ?? [])[0];
          }
        }
        if (!dancerId) continue;
        batch.update(doc(db, 'dancers', dancerId), { validatedSeasonIds: arrayUnion(seasonId) });
        count++;
      }
      await batch.commit();
      alert(`Synchronisation terminée : ${count} danseur(s) mis à jour.`);
    } finally {
      setBackfilling(false);
    }
  };

  const handleRejectGroup = async (g: GroupRow) => {
    if (!confirm(`Rejeter le plan groupé de ${g.displayName} ?`)) return;
    setActionId(g.id);
    const batch = writeBatch(db);
    for (const mid of g.membershipIds) {
      batch.update(doc(db, 'memberships', mid), {
        paymentPlanStatus: 'rejected',
        updatedAt: serverTimestamp(),
      });
    }
    batch.update(doc(db, 'paymentGroups', g.id), {
      paymentPlanStatus: 'rejected',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    setActionId(null);
    setGroupRows(prev => prev.filter(r => r.id !== g.id));
  };

  const totalItems = rows.length + groupRows.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Plans de paiement</h1>
        <div className="flex gap-2">
          <button onClick={handleBackfill} disabled={backfilling}
            className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 font-medium transition-colors">
            {backfilling ? 'Synchronisation…' : '↻ Sync trombinoscope'}
          </button>
          <Link href="/admin/payment-plans/new"
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 font-medium transition-colors">
            + Nouveau plan
          </Link>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {(['pending', 'approved', 'rejected'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvés' : 'Rejetés'}
          </button>
        ))}
      </div>

      {loading ? <p className="text-gray-500 text-sm">Chargement…</p> : totalItems === 0 ? (
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
                    <p className="font-semibold text-gray-900">{row.dancerName || row.displayName}</p>
                    {row.dancerName && <span className="text-xs text-gray-400">{row.displayName}</span>}
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
                  {row.installmentIds.length > 0 && (
                    <button onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                      className="text-xs text-gray-400 hover:text-gray-700">
                      {expanded === row.id ? 'Masquer' : 'Détail'}
                    </button>
                  )}
                </div>
              </div>
              {expanded === row.id && row.installments.length > 0 && (
                <div className="border-t border-gray-100 px-5 py-3 space-y-1.5">
                  {row.installments.map((inst, idx) => (
                    <div key={inst.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Versement {idx + 1} — {inst.expectedDate}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inst.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {inst.status === 'paid' ? 'Encaissé' : 'En attente'}
                        </span>
                        <span className="font-medium text-gray-800 w-16 text-right">{(inst.amount / 100).toFixed(2)} €</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {groupRows.map(g => (
            <div key={g.id} className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{g.displayName}</p>
                    <span className="text-xs text-gray-400">{g.email}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">Groupe</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{g.seasonLabel}</p>
                  <div className="mt-1.5 space-y-0.5">
                    {g.dancers.map((d, i) => (
                      <p key={i} className="text-sm text-gray-600">
                        <span className="font-medium text-gray-800">{d.name}</span>
                        <span className="text-gray-400"> · {d.planLabel}</span>
                      </p>
                    ))}
                  </div>
                  <p className="text-sm text-gray-700 mt-2">
                    Total : {(g.totalDue / 100).toFixed(2)} € · {METHOD_LABEL[g.paymentMethod] ?? g.paymentMethod}
                    {g.installmentIds.length > 0 && ` · ${g.installmentIds.length} versement${g.installmentIds.length > 1 ? 's' : ''}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {filter === 'pending' && (
                    <>
                      <button onClick={() => handleApproveGroup(g)} disabled={actionId === g.id}
                        className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                        {actionId === g.id ? '…' : 'Approuver'}
                      </button>
                      <button onClick={() => handleRejectGroup(g)} disabled={actionId === g.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
                        Rejeter
                      </button>
                    </>
                  )}
                  {g.installmentIds.length > 0 && (
                    <button onClick={() => setExpanded(expanded === g.id ? null : g.id)}
                      className="text-xs text-gray-400 hover:text-gray-700">
                      {expanded === g.id ? 'Masquer' : 'Détail'}
                    </button>
                  )}
                </div>
              </div>
              {expanded === g.id && g.installments.length > 0 && (
                <div className="border-t border-gray-100 px-5 py-3 space-y-1.5">
                  {g.installments.map((inst, idx) => (
                    <div key={inst.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Versement {idx + 1} — {inst.expectedDate}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inst.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {inst.status === 'paid' ? 'Encaissé' : 'En attente'}
                        </span>
                        <span className="font-medium text-gray-800 w-16 text-right">{(inst.amount / 100).toFixed(2)} €</span>
                      </div>
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
