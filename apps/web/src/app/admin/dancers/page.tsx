'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';

interface Season { id: string; label: string; startDate: string; isActive: boolean; }
interface Account { id: string; dancerIds: string[]; }

interface MembershipInfo {
  planLabel: string;
  paymentMethod: string;
  totalDue: number;
  status: string;
  isGroup: boolean;
}

interface DancerRow {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  roles: string[];
  isActive: boolean;
  info?: MembershipInfo;
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

export default function AdminDancersPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [rows, setRows] = useState<DancerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'seasons')).then(snap => {
      const s = snap.docs.map(d => ({
        id: d.id,
        label: d.data().label ?? d.id,
        startDate: d.data().startDate ?? '',
        isActive: d.data().isActive === true,
      }));
      s.sort((a, b) => String(b.startDate ?? '').localeCompare(String(a.startDate ?? '')));
      setSeasons(s);
      const active = s.find(s => s.isActive);
      setSelectedSeasonId(active ? active.id : (s[0]?.id ?? ''));
    });
  }, []);

  useEffect(() => {
    if (!selectedSeasonId) return;
    setLoading(true);

    Promise.all([
      getDocs(collection(db, 'dancers')),
      getDocs(collection(db, 'accounts')),
      getDocs(query(collection(db, 'memberships'), where('seasonId', '==', selectedSeasonId))),
      getDocs(query(collection(db, 'paymentGroups'), where('seasonId', '==', selectedSeasonId))),
      getDocs(collection(db, 'pricingPlans')),
    ]).then(([dancerSnap, accountSnap, membershipSnap, groupSnap, planSnap]) => {
      const accountMap = new Map<string, Account>();
      accountSnap.docs.forEach(d => {
        accountMap.set(d.id, { id: d.id, dancerIds: d.data().dancerIds ?? [] });
      });

      const planLabelMap = new Map<string, string>();
      planSnap.docs.forEach(d => {
        planLabelMap.set(d.id, d.data().label ?? d.data().name ?? '');
      });

      const membershipById = new Map<string, any>();
      membershipSnap.docs.forEach(d => membershipById.set(d.id, { id: d.id, ...d.data() }));

      const infoByDancer = new Map<string, MembershipInfo>();

      // Solo memberships
      membershipSnap.docs.forEach(d => {
        const m = d.data();
        if (m.paymentGroupId) return;
        let did: string | undefined = m.dancerId;
        if (!did) did = accountMap.get(m.userId)?.dancerIds?.[0];
        if (did && !infoByDancer.has(did)) {
          infoByDancer.set(did, {
            planLabel: planLabelMap.get(m.pricingPlanId) ?? '',
            paymentMethod: m.paymentMethod ?? '',
            totalDue: m.totalDue ?? 0,
            status: m.paymentPlanStatus ?? '',
            isGroup: false,
          });
        }
      });

      // Group memberships
      groupSnap.docs.forEach(d => {
        const g = d.data();
        (g.membershipIds as string[] ?? []).forEach((mId: string) => {
          const m = membershipById.get(mId);
          if (!m) return;
          let did: string | undefined = m.dancerId;
          if (!did) did = accountMap.get(m.userId)?.dancerIds?.[0];
          if (did && !infoByDancer.has(did)) {
            infoByDancer.set(did, {
              planLabel: planLabelMap.get(m.pricingPlanId) ?? '',
              paymentMethod: g.paymentMethod ?? '',
              totalDue: m.totalDue ?? 0,
              status: g.paymentPlanStatus ?? '',
              isGroup: true,
            });
          }
        });
      });

      const dancers: DancerRow[] = dancerSnap.docs
        .map(d => ({
          id: d.id,
          firstName: d.data().firstName ?? '',
          lastName: d.data().lastName ?? '',
          photoUrl: d.data().photoUrl,
          roles: d.data().roles ?? [],
          isActive: d.data().isActive !== false,
          info: infoByDancer.get(d.id),
        }))
        .filter(d =>
          // A une cotisation sur la saison sélectionnée
          infoByDancer.has(d.id) ||
          // Ou est en essai (pas lié à une saison via cotisation)
          d.roles.includes('trial')
        );
      dancers.sort((a, b) =>
        a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')
      );

      setRows(dancers);
    }).finally(() => setLoading(false));
  }, [selectedSeasonId]);

  const filtered = search.trim().length >= 1
    ? rows.filter(r => {
        const q = search.toLowerCase();
        return r.firstName.toLowerCase().includes(q) || r.lastName.toLowerCase().includes(q);
      })
    : rows;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/courses" className="text-sm text-gray-400 hover:text-gray-700">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900">Danseurs</h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <select
          value={selectedSeasonId}
          onChange={e => setSelectedSeasonId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filtrer par nom ou prénom…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <span className="text-sm text-gray-400 self-center whitespace-nowrap">{filtered.length} danseur(s)</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-3 w-10"></th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prénom</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Plan</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Méthode</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Montant</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(row => (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2">
                    {row.photoUrl ? (
                      <img src={row.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                        {row.firstName[0]}{row.lastName[0]}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{row.lastName}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{row.firstName}</td>
                  <td className="px-3 py-3 text-gray-600 hidden sm:table-cell max-w-[160px]">
                    {row.info ? (
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {row.info.isGroup && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Groupe</span>
                        )}
                        {row.info.planLabel && (
                          <span className="truncate max-w-[120px]" title={row.info.planLabel}>{row.info.planLabel}</span>
                        )}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-gray-500 hidden sm:table-cell whitespace-nowrap">
                    {row.info?.paymentMethod
                      ? METHOD_LABEL[row.info.paymentMethod] ?? row.info.paymentMethod
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-gray-700 hidden md:table-cell whitespace-nowrap">
                    {row.info ? `${(row.info.totalDue / 100).toFixed(2)} €` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {row.info ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[row.info.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABEL[row.info.status] ?? row.info.status}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">Pas de cotisation</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <Link href={`/admin/dancers/${row.id}`}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800">
                      Détail →
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                    Aucun danseur trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
