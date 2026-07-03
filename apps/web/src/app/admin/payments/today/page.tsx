'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, doc, getDoc, increment,
  serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { METHOD_LABEL, METHOD_COLOR } from '@/lib/payment-constants';
import Link from 'next/link';

interface DueRow {
  id: string;
  amount: number;
  expectedDate: string;
  method: string;
  planId: string;
  planKind: 'solo' | 'group';
  userId: string;
  memberName: string;
  photoUrl?: string;
  chequeNumber: string;
  draweeBank: string;
  draweeCity: string;
  saved: boolean;
}

// Firestore limite un writeBatch à 500 écritures. Chaque ligne produit
// jusqu'à 2 écritures (payment + installment), + 1 écriture par plan
// distinct (memberships/paymentGroups) mise à jour dans le lot.
// 150 lignes garantit de rester largement sous la limite même sans
// mutualisation de plans.
const CHUNK_SIZE = 150;

export default function TodayPaymentsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<DueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);

    (async () => {
      try {
        // index on (status + expectedDate) may still be building — filter date client-side
        const instSnap = await getDocs(query(
          collection(db, 'paymentInstallments'),
          where('status', '==', 'pending'),
        ));

        if (instSnap.empty) { setLoading(false); return; }

        const userIds = [...new Set(instSnap.docs.map(d => d.data().userId as string).filter(Boolean))];
        const membershipIds = [...new Set(instSnap.docs.map(d => d.data().membershipId as string).filter(Boolean))];
        const groupIds = [...new Set(instSnap.docs.map(d => d.data().paymentGroupId as string).filter(Boolean))];

        const [accountDocs, membershipDocs, groupDocs, dancerSnap] = await Promise.all([
          Promise.all(userIds.map(id => getDoc(doc(db, 'accounts', id)))),
          Promise.all(membershipIds.map(id => getDoc(doc(db, 'memberships', id)))),
          Promise.all(groupIds.map(id => getDoc(doc(db, 'paymentGroups', id)))),
          getDocs(collection(db, 'dancers')),
        ]);

        const dancerMap = new Map<string, string>();
        const dancerPhotoMap = new Map<string, string>();
        dancerSnap.docs.forEach(d => {
          dancerMap.set(d.id, `${d.data().firstName ?? ''} ${d.data().lastName ?? ''}`.trim());
          if (d.data().photoUrl) dancerPhotoMap.set(d.id, d.data().photoUrl);
        });

        const accountMap = new Map<string, { dancerIds: string[]; displayName: string }>();
        accountDocs.forEach(d => {
          if (d.exists()) accountMap.set(d.id, { dancerIds: d.data().dancerIds ?? [], displayName: d.data().displayName ?? '' });
        });

        const validMemberships = new Set(membershipDocs.filter(d => d.exists()).map(d => d.id));
        const validGroups = new Set(groupDocs.filter(d => d.exists()).map(d => d.id));

        // membershipId → dancerId (for solo plans: show only the relevant dancer)
        const membershipDancerMap = new Map<string, string>();
        membershipDocs.forEach(d => {
          if (d.exists()) {
            const dancerId = d.data().dancerId as string | undefined;
            if (dancerId) membershipDancerMap.set(d.id, dancerId);
          }
        });

        const getMemberName = (userId: string): string => {
          const acc = accountMap.get(userId);
          if (!acc) return userId;
          const names = acc.dancerIds.map(id => dancerMap.get(id)).filter(Boolean) as string[];
          return names.length > 0 ? names.join(' & ') : (acc.displayName || userId);
        };

        const dueRows: DueRow[] = instSnap.docs
          .filter(d => (d.data().expectedDate ?? '') <= today)
          .reduce<DueRow[]>((acc, d) => {
            const data = d.data();
            const membershipId = data.membershipId as string | undefined;
            const paymentGroupId = data.paymentGroupId as string | undefined;

            let planId: string;
            let planKind: 'solo' | 'group';
            let memberName: string;
            let photoUrl: string | undefined;

            if (paymentGroupId && validGroups.has(paymentGroupId)) {
              planId = paymentGroupId;
              planKind = 'group';
              memberName = getMemberName(data.userId ?? '');
              const firstDancerId = accountMap.get(data.userId ?? '')?.dancerIds?.[0];
              if (firstDancerId) photoUrl = dancerPhotoMap.get(firstDancerId);
            } else if (membershipId && validMemberships.has(membershipId)) {
              planId = membershipId;
              planKind = 'solo';
              const dancerId = membershipDancerMap.get(membershipId);
              memberName = (dancerId && dancerMap.get(dancerId))
                ? dancerMap.get(dancerId)!
                : getMemberName(data.userId ?? '');
              if (dancerId) photoUrl = dancerPhotoMap.get(dancerId);
            } else {
              return acc;
            }

            acc.push({
              id: d.id,
              amount: data.amount ?? 0,
              expectedDate: data.expectedDate ?? '',
              method: data.method ?? '',
              planId,
              planKind,
              userId: data.userId ?? '',
              memberName,
              photoUrl,
              chequeNumber: data.chequeNumber ?? '',
              draweeBank: data.draweeBank ?? '',
              draweeCity: data.draweeCity ?? '',
              saved: false,
            });
            return acc;
          }, [])
          .sort((a, b) =>
            a.expectedDate.localeCompare(b.expectedDate) ||
            a.memberName.localeCompare(b.memberName, 'fr')
          );

        setRows(dueRows);
        setSelected(new Set(dueRows.map(r => r.id)));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const updateRow = (id: string, patch: Partial<DueRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const pendingCount = rows.filter(r => !r.saved).length;
  const today = new Date().toISOString().slice(0, 10);
  const filteredRows = search.trim().length < 1
    ? rows
    : rows.filter(r => r.memberName.toLowerCase().includes(search.trim().toLowerCase()));

  const selectableRows = filteredRows.filter(r => !r.saved);
  const selectedRows = rows.filter(r => selected.has(r.id) && !r.saved);
  const totalCents = selectedRows.reduce((sum, r) => sum + r.amount, 0);

  const handleValidateAll = async () => {
    if (!user || selectedRows.length === 0) return;
    setProcessing(true);
    setBulkError(null);
    setProgress({ done: 0, total: selectedRows.length });

    const succeededIds: string[] = [];

    try {
      for (let i = 0; i < selectedRows.length; i += CHUNK_SIZE) {
        const chunk = selectedRows.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        // Regroupe les incréments de plan par planId pour éviter deux
        // écritures sur le même document dans un même batch.
        const planIncrements = new Map<string, { kind: 'solo' | 'group'; amount: number }>();

        for (const row of chunk) {
          batch.set(doc(collection(db, 'payments')), {
            userId: row.userId,
            amount: row.amount,
            provider: 'manual',
            status: 'paid',
            ...(row.planKind === 'group'
              ? { relatedGroupId: row.planId }
              : { relatedMembershipId: row.planId }),
            recordedBy: user.uid,
            createdAt: serverTimestamp(),
          });

          batch.update(doc(db, 'paymentInstallments', row.id), {
            status: 'paid',
            actualDate: new Date().toISOString().slice(0, 10),
            ...(row.method === 'cheque' && row.chequeNumber ? { chequeNumber: row.chequeNumber } : {}),
            ...(row.method === 'cheque' && row.draweeBank ? { draweeBank: row.draweeBank } : {}),
            ...(row.method === 'cheque' && row.draweeCity ? { draweeCity: row.draweeCity } : {}),
          });

          const existing = planIncrements.get(row.planId);
          planIncrements.set(row.planId, { kind: row.planKind, amount: (existing?.amount ?? 0) + row.amount });
        }

        for (const [planId, { kind, amount }] of planIncrements) {
          batch.update(doc(db, kind === 'group' ? 'paymentGroups' : 'memberships', planId), {
            totalPaid: increment(amount),
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
        succeededIds.push(...chunk.map(r => r.id));
        setProgress({ done: succeededIds.length, total: selectedRows.length });
      }
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    } finally {
      setRows(prev => prev.map(r => succeededIds.includes(r.id) ? { ...r, saved: true } : r));
      setSelected(prev => {
        const next = new Set(prev);
        succeededIds.forEach(id => next.delete(id));
        return next;
      });
      setTimeout(() => setRows(prev => prev.filter(r => !succeededIds.includes(r.id))), 1500);
      setProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/courses" className="text-sm text-gray-400 hover:text-gray-700">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900">Encaissements à traiter</h1>
        {!loading && pendingCount > 0 && (
          <span className="bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {pendingCount}
          </span>
        )}
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      )}
      {bulkError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-red-700">Erreur : {bulkError}</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un danseur…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
          <p className="text-gray-500 font-medium">Aucun encaissement à traiter.</p>
          <p className="text-gray-400 text-sm mt-1">Tous les versements prévus à ce jour ont été enregistrés.</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
          <p className="text-gray-500 font-medium">Aucun danseur trouvé.</p>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm -mx-1 px-1 py-3 mb-3 flex flex-wrap items-center gap-3 border-b border-gray-100">
            <button
              type="button"
              onClick={() => setSelected(
                selectableRows.every(r => selected.has(r.id))
                  ? new Set([...selected].filter(id => !selectableRows.some(r => r.id === id)))
                  : new Set([...selected, ...selectableRows.map(r => r.id)])
              )}
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              {selectableRows.every(r => selected.has(r.id)) ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            {selectedRows.length > 0 && (
              <span className="text-xs text-gray-500">
                {selectedRows.length} sélectionné{selectedRows.length > 1 ? 's' : ''} · {(totalCents / 100).toFixed(2)} €
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={handleValidateAll}
              disabled={processing || selectedRows.length === 0}
              className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors whitespace-nowrap"
            >
              {processing
                ? `Enregistrement… ${progress ? `${progress.done}/${progress.total}` : ''}`
                : `Valider les encaissements (${selectedRows.length})`}
            </button>
          </div>

          <div className="space-y-3">
            {filteredRows.map(row => (
              <div
                key={row.id}
                className={`bg-white rounded-2xl border shadow-sm p-5 transition-all duration-300 ${
                  row.saved ? 'border-green-300 bg-green-50' : 'border-gray-200'
                }`}
              >
                {row.saved ? (
                  <div className="flex items-center gap-2 text-green-700 font-medium text-sm py-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Encaissement enregistré pour {row.memberName}
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      className="w-4 h-4 rounded mt-1.5 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          {row.photoUrl ? (
                            <img src={row.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                              {row.memberName.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-gray-900 text-base">{row.memberName}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Prévu le {new Date(row.expectedDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                              {row.expectedDate < today && (
                                <span className="ml-1.5 font-medium text-orange-600">· En retard</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLOR[row.method as keyof typeof METHOD_COLOR] ?? 'bg-gray-100 text-gray-500'}`}>
                            {METHOD_LABEL[row.method as keyof typeof METHOD_LABEL] ?? row.method}
                          </span>
                          <span className="text-lg font-bold text-gray-900">{(row.amount / 100).toFixed(2)} €</span>
                        </div>
                      </div>

                      {row.method === 'cheque' && (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">N° chèque</label>
                            <input
                              type="text"
                              placeholder="ex : 0012345"
                              value={row.chequeNumber}
                              onChange={e => updateRow(row.id, { chequeNumber: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Banque</label>
                            <input
                              type="text"
                              placeholder="ex : Crédit Mutuel"
                              value={row.draweeBank}
                              onChange={e => updateRow(row.id, { draweeBank: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Ville</label>
                            <input
                              type="text"
                              placeholder="ex : Grenoble"
                              value={row.draweeCity}
                              onChange={e => updateRow(row.id, { draweeCity: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
