'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Dancer {
  id: string;
  firstName: string;
  lastName: string;
  accountId: string;
  roles: string[];
  isActive: boolean;
}
interface Account {
  id: string;
  email: string;
  displayName: string;
  dancerIds: string[];
}
interface Installment {
  id: string;
  expectedDate: string;
  amount: number;
  status: string;
}
interface Entry {
  id: string;
  kind: 'solo' | 'group';
  seasonLabel: string;
  seasonId: string;
  planLabel: string;
  paymentMethod: string;
  totalDue: number;
  totalPaid: number;
  status: string;
  installmentIds: string[];
  installments: Installment[];
  groupDancerNames: string[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente', approved: 'Approuvé', active: 'Actif',
  rejected: 'Rejeté', cancelled: 'Annulé',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700', approved: 'bg-green-100 text-green-700',
  active: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};
const METHOD_LABEL: Record<string, string> = {
  cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces', online: 'En ligne',
};

export default function DancerDetailPage() {
  const { dancerId } = useParams<{ dancerId: string }>();
  const [dancer, setDancer] = useState<Dancer | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dancerId) return;

    (async () => {
      setLoading(true);
      try {
        const dancerSnap = await getDoc(doc(db, 'dancers', dancerId));
        if (!dancerSnap.exists()) return;
        const d = dancerSnap.data();
        const dancerData: Dancer = {
          id: dancerSnap.id,
          firstName: d.firstName ?? '',
          lastName: d.lastName ?? '',
          accountId: d.accountId ?? '',
          roles: d.roles ?? [],
          isActive: d.isActive !== false,
        };
        setDancer(dancerData);

        const accountSnap = await getDoc(doc(db, 'accounts', dancerData.accountId));
        const accountData: Account | null = accountSnap.exists() ? {
          id: accountSnap.id,
          email: accountSnap.data().email ?? '',
          displayName: accountSnap.data().displayName ?? '',
          dancerIds: accountSnap.data().dancerIds ?? [],
        } : null;
        setAccount(accountData);

        const [membershipSnap, groupSnap, seasonSnap, planSnap, allDancerSnap] = await Promise.all([
          getDocs(query(collection(db, 'memberships'), where('userId', '==', dancerData.accountId))),
          getDocs(query(collection(db, 'paymentGroups'), where('userId', '==', dancerData.accountId))),
          getDocs(collection(db, 'seasons')),
          getDocs(collection(db, 'pricingPlans')),
          getDocs(collection(db, 'dancers')),
        ]);

        const seasonLabelMap = new Map<string, string>();
        seasonSnap.docs.forEach(s => seasonLabelMap.set(s.id, s.data().label ?? s.id));

        const planLabelMap = new Map<string, string>();
        planSnap.docs.forEach(p => planLabelMap.set(p.id, p.data().label ?? p.data().name ?? ''));

        const dancerNameMap = new Map<string, string>();
        allDancerSnap.docs.forEach(d => {
          dancerNameMap.set(d.id, `${d.data().firstName ?? ''} ${d.data().lastName ?? ''}`.trim());
        });

        const membershipById = new Map<string, any>();
        membershipSnap.docs.forEach(d => membershipById.set(d.id, { id: d.id, ...d.data() }));

        const isThisDancer = (m: any): boolean => {
          if (m.dancerId) return m.dancerId === dancerId;
          return accountData?.dancerIds?.[0] === dancerId;
        };

        const allEntries: Entry[] = [];

        // Solo memberships
        membershipSnap.docs.forEach(d => {
          const m = { id: d.id, ...d.data() };
          if (m.paymentGroupId) return;
          if (!isThisDancer(m)) return;
          allEntries.push({
            id: m.id,
            kind: 'solo',
            seasonId: m.seasonId ?? '',
            seasonLabel: seasonLabelMap.get(m.seasonId) ?? m.seasonId,
            planLabel: planLabelMap.get(m.pricingPlanId) ?? '',
            paymentMethod: m.paymentMethod ?? '',
            totalDue: m.totalDue ?? 0,
            totalPaid: m.totalPaid ?? 0,
            status: m.paymentPlanStatus ?? '',
            installmentIds: m.installmentIds ?? [],
            installments: [],
            groupDancerNames: [],
          });
        });

        // Group memberships
        for (const d of groupSnap.docs) {
          const g = { id: d.id, ...d.data() };
          const membershipIds: string[] = g.membershipIds ?? [];
          const myMembership = membershipIds.map(id => membershipById.get(id)).filter(Boolean).find(m => isThisDancer(m));
          if (!myMembership) continue;

          const otherDancerNames = (accountData?.dancerIds ?? [])
            .filter(id => id !== dancerId)
            .map(id => dancerNameMap.get(id) ?? '')
            .filter(Boolean);

          allEntries.push({
            id: g.id,
            kind: 'group',
            seasonId: g.seasonId ?? '',
            seasonLabel: seasonLabelMap.get(g.seasonId) ?? g.seasonId,
            planLabel: planLabelMap.get(myMembership.pricingPlanId) ?? '',
            paymentMethod: g.paymentMethod ?? '',
            totalDue: g.totalDue ?? 0,
            totalPaid: g.totalPaid ?? 0,
            status: g.paymentPlanStatus ?? '',
            installmentIds: g.installmentIds ?? [],
            installments: [],
            groupDancerNames: otherDancerNames,
          });
        }

        allEntries.sort((a, b) => b.seasonId.localeCompare(a.seasonId));

        // Load installments in parallel
        await Promise.all(allEntries.map(async entry => {
          if (entry.installmentIds.length === 0) return;
          const insts = await Promise.all(
            entry.installmentIds.map(async id => {
              const snap = await getDoc(doc(db, 'paymentInstallments', id));
              return snap.exists() ? {
                id,
                expectedDate: snap.data().expectedDate ?? '',
                amount: snap.data().amount ?? 0,
                status: snap.data().status ?? 'pending',
              } : null;
            })
          );
          entry.installments = insts.filter(Boolean) as Installment[];
        }));

        setEntries(allEntries);
      } finally {
        setLoading(false);
      }
    })();
  }, [dancerId]);

  if (loading) {
    return <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>;
  }
  if (!dancer) {
    return <div className="text-center py-12 text-gray-400 text-sm">Danseur introuvable.</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/dancers" className="text-sm text-gray-400 hover:text-gray-700">← Danseurs</Link>
        <h1 className="text-2xl font-bold text-gray-900">{dancer.firstName} {dancer.lastName}</h1>
      </div>

      {/* Dancer info card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold text-gray-900">{dancer.firstName} {dancer.lastName}</p>
            {account && <p className="text-sm text-gray-500 mt-0.5">{account.email}</p>}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dancer.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
            {dancer.isActive ? 'Actif' : 'Inactif'}
          </span>
        </div>
        {dancer.roles.length > 0 && (
          <div className="flex gap-2 mt-3">
            {dancer.roles.map(r => (
              <span key={r} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                {r === 'member' ? 'Membre' : r === 'trial' ? 'Essai' : r}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Cotisations */}
      <h2 className="text-base font-semibold text-gray-900 mb-3">Cotisations</h2>

      {entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">
          Aucune cotisation enregistrée.
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(entry => (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{entry.seasonLabel}</p>
                    {entry.kind === 'group' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Groupe</span>
                    )}
                  </div>
                  {entry.kind === 'group' && entry.groupDancerNames.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">Avec : {entry.groupDancerNames.join(', ')}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[entry.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABEL[entry.status] ?? entry.status}
                </span>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {entry.planLabel && (
                  <div>
                    <p className="text-xs text-gray-400">Plan</p>
                    <p className="text-sm font-medium text-gray-800">{entry.planLabel}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-400">Mode de paiement</p>
                  <p className="text-sm font-medium text-gray-800">{METHOD_LABEL[entry.paymentMethod] ?? entry.paymentMethod || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total dû</p>
                  <p className="text-sm font-semibold text-gray-900">{(entry.totalDue / 100).toFixed(2)} €</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total encaissé</p>
                  <p className={`text-sm font-semibold ${entry.totalPaid >= entry.totalDue ? 'text-green-700' : 'text-gray-900'}`}>
                    {(entry.totalPaid / 100).toFixed(2)} €
                  </p>
                </div>
              </div>

              {/* Installments */}
              <div className="border-t border-gray-100 pt-4">
                {entry.installments.length > 0 ? (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Versements</p>
                    <div className="space-y-2">
                      {entry.installments.map((inst, idx) => (
                        <div key={inst.id} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}.</span>
                            <span className="text-sm text-gray-700">{inst.expectedDate}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inst.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                              {inst.status === 'paid' ? 'Encaissé' : 'En attente'}
                            </span>
                            <span className="text-sm font-medium text-gray-800 w-20 text-right">
                              {(inst.amount / 100).toFixed(2)} €
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">Aucun versement planifié.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
