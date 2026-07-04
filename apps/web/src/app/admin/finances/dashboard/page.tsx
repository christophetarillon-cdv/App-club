'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '@/lib/firebase';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeasonOption { id: string; label: string; isActive: boolean; }

interface PlanLite {
  id: string;
  kind: 'solo' | 'group';
  userId: string;
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
  refundAmount?: number;
  refundMethod?: string;
  cancelledAt?: any;
}

interface MembershipFull {
  id: string;
  userId: string;
  dancerId?: string;
  pricingPlanId: string;
  totalDue: number;
  paymentGroupId?: string;
}

interface InstallmentLite {
  id: string;
  amount: number;
  method: string;
  status: string;
  expectedDate: string;
  actualDate?: string;
  bankDepositId?: string;
  planId: string; // membershipId or paymentGroupId, for name lookup
}

interface BankDepositLite {
  id: string;
  depositDate: string;
  bankAccount: string;
  totalAmount: number;
  chequeCount: number;
  installmentIds: string[];
}

const METHOD_LABEL: Record<string, string> = { cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces' };
const METHOD_COLORS: Record<string, string> = { cheque: '#EF9F27', transfer: '#378ADD', cash: '#1D9E75' };
const STATUS_LABEL: Record<string, string> = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté', cancelled: 'Annulé' };
const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function money(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS_FR[parseInt(m!, 10) - 1]} ${y}`;
}

const todayStr = new Date().toISOString().slice(0, 10);

export default function FinanceDashboardPage() {
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [loading, setLoading] = useState(false);

  const [plans, setPlans] = useState<PlanLite[]>([]);
  const [allMemberships, setAllMemberships] = useState<MembershipFull[]>([]);
  const [installments, setInstallments] = useState<InstallmentLite[]>([]);
  const [pricingPlanLabels, setPricingPlanLabels] = useState<Record<string, string>>({});
  const [bankDeposits, setBankDeposits] = useState<BankDepositLite[]>([]);
  const [nameByPlanId, setNameByPlanId] = useState<Record<string, string>>({});

  const c1Ref = useRef<HTMLCanvasElement>(null);
  const c2Ref = useRef<HTMLCanvasElement>(null);
  const c3Ref = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Record<string, any>>({});

  useEffect(() => {
    getDocs(collection(db, 'seasons')).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, label: d.data().label ?? d.id, isActive: d.data().isActive === true }));
      setSeasons(list);
      const active = list.find(s => s.isActive) ?? list[0];
      if (active) setSelectedSeasonId(active.id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!selectedSeasonId) return;
    setLoading(true);
    try {
      const [membershipSnap, groupSnap, pricingSnap, accountSnap, dancerSnap, allDepositsSnap] = await Promise.all([
        getDocs(query(collection(db, 'memberships'), where('seasonId', '==', selectedSeasonId))),
        getDocs(query(collection(db, 'paymentGroups'), where('seasonId', '==', selectedSeasonId))),
        getDocs(query(collection(db, 'pricingPlans'), where('seasonId', '==', selectedSeasonId))),
        getDocs(collection(db, 'accounts')),
        getDocs(collection(db, 'dancers')),
        getDocs(collection(db, 'bankDeposits')),
      ]);

      const dancerMap = new Map<string, { firstName: string; lastName: string }>();
      dancerSnap.docs.forEach(d => dancerMap.set(d.id, { firstName: d.data().firstName ?? '', lastName: d.data().lastName ?? '' }));
      const accountMap = new Map<string, { displayName: string; dancerIds: string[] }>();
      accountSnap.docs.forEach(d => accountMap.set(d.id, { displayName: d.data().displayName ?? '', dancerIds: d.data().dancerIds ?? [] }));

      const memberships: MembershipFull[] = membershipSnap.docs.map(d => ({
        id: d.id,
        userId: d.data().userId,
        dancerId: d.data().dancerId,
        pricingPlanId: d.data().pricingPlanId,
        totalDue: d.data().totalDue ?? 0,
        paymentGroupId: d.data().paymentGroupId,
      }));
      setAllMemberships(memberships);

      const soloPlans: PlanLite[] = membershipSnap.docs
        .filter(d => !d.data().paymentGroupId)
        .map(d => ({
          id: d.id, kind: 'solo', userId: d.data().userId,
          totalDue: d.data().totalDue ?? 0, totalPaid: d.data().totalPaid ?? 0,
          paymentMethod: d.data().paymentMethod, paymentPlanStatus: d.data().paymentPlanStatus,
          installmentIds: d.data().installmentIds ?? [],
          refundAmount: d.data().refundAmount, refundMethod: d.data().refundMethod, cancelledAt: d.data().cancelledAt,
        }));
      const groupPlans: PlanLite[] = groupSnap.docs.map(d => ({
        id: d.id, kind: 'group', userId: d.data().userId,
        totalDue: d.data().totalDue ?? 0, totalPaid: d.data().totalPaid ?? 0,
        paymentMethod: d.data().paymentMethod, paymentPlanStatus: d.data().paymentPlanStatus,
        installmentIds: d.data().installmentIds ?? [],
        refundAmount: d.data().refundAmount, refundMethod: d.data().refundMethod, cancelledAt: d.data().cancelledAt,
      }));
      const allPlans = [...soloPlans, ...groupPlans];
      setPlans(allPlans);

      // Name lookup for échéances lists
      const names: Record<string, string> = {};
      soloPlans.forEach(p => {
        const m = memberships.find(mm => mm.id === p.id);
        const dancer = m?.dancerId ? dancerMap.get(m.dancerId) : undefined;
        names[p.id] = dancer ? `${dancer.firstName} ${dancer.lastName}`.trim() : (accountMap.get(p.userId)?.displayName ?? p.userId);
      });
      groupPlans.forEach(p => {
        names[p.id] = accountMap.get(p.userId)?.displayName ?? p.userId;
      });
      setNameByPlanId(names);

      const pricingLabels: Record<string, string> = {};
      pricingSnap.docs.forEach(d => { pricingLabels[d.id] = d.data().label ?? d.id; });
      setPricingPlanLabels(pricingLabels);

      // Installments — batch fetch by id, tagged with owning plan for name lookup
      const idToPlan = new Map<string, string>();
      allPlans.forEach(p => p.installmentIds.forEach(id => idToPlan.set(id, p.id)));
      const uniqueIds = [...idToPlan.keys()];
      const instSnaps = await Promise.all(uniqueIds.map(id => getDoc(doc(db, 'paymentInstallments', id))));
      const insts: InstallmentLite[] = instSnaps
        .filter(s => s.exists())
        .map(s => ({
          id: s.id,
          amount: s.data()!.amount ?? 0,
          method: s.data()!.method,
          status: s.data()!.status,
          expectedDate: s.data()!.expectedDate ?? '',
          actualDate: s.data()!.actualDate,
          bankDepositId: s.data()!.bankDepositId,
          planId: idToPlan.get(s.id) ?? '',
        }));
      setInstallments(insts);

      const seasonInstallmentIds = new Set(uniqueIds);
      const deposits: BankDepositLite[] = allDepositsSnap.docs
        .map(d => ({
          id: d.id, depositDate: d.data().depositDate, bankAccount: d.data().bankAccount,
          totalAmount: d.data().totalAmount ?? 0, chequeCount: d.data().chequeCount ?? 0,
          installmentIds: d.data().installmentIds ?? [],
        }))
        .filter(dep => dep.installmentIds.some((id: string) => seasonInstallmentIds.has(id)))
        .sort((a, b) => b.depositDate.localeCompare(a.depositDate));
      setBankDeposits(deposits);
    } finally {
      setLoading(false);
    }
  }, [selectedSeasonId]);

  useEffect(() => { load(); }, [load]);

  // ── Aggregations ────────────────────────────────────────────────────────────

  const totalDue = plans.reduce((s, p) => s + p.totalDue, 0);
  const totalPaid = plans.reduce((s, p) => s + p.totalPaid, 0);
  const resteAEncaisser = totalDue - totalPaid;
  const tauxRecouvrement = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

  const lateInstallments = installments.filter(i => i.status === 'pending' && i.expectedDate && i.expectedDate < todayStr);
  const montantEnRetard = lateInstallments.reduce((s, i) => s + i.amount, 0);

  const statusCounts: Record<string, number> = {};
  plans.forEach(p => { statusCounts[p.paymentPlanStatus] = (statusCounts[p.paymentPlanStatus] ?? 0) + 1; });

  const totalRefunded = plans.reduce((s, p) => s + (p.refundAmount ?? 0), 0);
  const refundsByMethod: Record<string, number> = {};
  plans.forEach(p => { if (p.refundAmount) refundsByMethod[p.refundMethod ?? '?'] = (refundsByMethod[p.refundMethod ?? '?'] ?? 0) + p.refundAmount; });
  const refundEntries = plans.filter(p => !!p.refundAmount);

  const paidInstallments = installments.filter(i => i.status === 'paid');
  const methodBreakdown: Record<string, { amount: number; count: number }> = {};
  paidInstallments.forEach(i => {
    if (!methodBreakdown[i.method]) methodBreakdown[i.method] = { amount: 0, count: 0 };
    methodBreakdown[i.method]!.amount += i.amount;
    methodBreakdown[i.method]!.count += 1;
  });

  // Monthly matrix: month -> method -> amount
  const monthlyMatrix = new Map<string, Record<string, number>>();
  const monthlyExpected = new Map<string, number>();
  installments.forEach(i => {
    if (i.expectedDate) {
      const key = monthKey(i.expectedDate);
      monthlyExpected.set(key, (monthlyExpected.get(key) ?? 0) + i.amount);
    }
    if (i.status === 'paid' && i.actualDate) {
      const key = monthKey(i.actualDate);
      if (!monthlyMatrix.has(key)) monthlyMatrix.set(key, {});
      const row = monthlyMatrix.get(key)!;
      row[i.method] = (row[i.method] ?? 0) + i.amount;
    }
  });
  const allMonths = [...new Set([...monthlyMatrix.keys(), ...monthlyExpected.keys()])].sort();
  const methods = ['cheque', 'transfer', 'cash'];

  const upcomingInstallments = installments
    .filter(i => i.status === 'pending' && i.expectedDate >= todayStr)
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))
    .slice(0, 30);

  const chequesAwaitingDeposit = installments.filter(i => i.method === 'cheque' && i.status === 'paid' && !i.bankDepositId);
  const chequesAwaitingAmount = chequesAwaitingDeposit.reduce((s, i) => s + i.amount, 0);

  const dueByPlan: Record<string, number> = {};
  allMemberships.forEach(m => { dueByPlan[m.pricingPlanId] = (dueByPlan[m.pricingPlanId] ?? 0) + m.totalDue; });

  // ── Charts ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    (async () => {
      const { Chart, registerables } = await import('chart.js');
      if (cancelled) return;
      Chart.register(...registerables);

      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const gridColor = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
      const tickColor = isDark ? '#888' : '#999';
      const baseScales = {
        x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, beginAtZero: true },
      };

      Object.values(charts.current).forEach((c: any) => { try { c.destroy(); } catch {} });
      charts.current = {};

      if (c1Ref.current) {
        const labels = Object.keys(methodBreakdown);
        charts.current.c1 = new Chart(c1Ref.current, {
          type: 'doughnut',
          data: {
            labels: labels.map(m => METHOD_LABEL[m] ?? m),
            datasets: [{ data: labels.map(m => methodBreakdown[m]!.amount), backgroundColor: labels.map(m => METHOD_COLORS[m] ?? '#999'), borderWidth: 0, hoverOffset: 4 }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: tickColor } },
              tooltip: { callbacks: { label: (v: any) => `${v.label}: ${money(v.raw)}` } } },
            cutout: '68%',
          },
        });
      }

      if (c2Ref.current && allMonths.length) {
        charts.current.c2 = new Chart(c2Ref.current, {
          type: 'line',
          data: {
            labels: allMonths.map(monthLabel),
            datasets: [
              { label: 'Attendu', data: allMonths.map(m => (monthlyExpected.get(m) ?? 0) / 100),
                borderColor: '#999', backgroundColor: 'transparent', borderDash: [5, 3], borderWidth: 2, pointRadius: 2, tension: 0.3 },
              { label: 'Encaissé', data: allMonths.map(m => methods.reduce((s, meth) => s + (monthlyMatrix.get(m)?.[meth] ?? 0), 0) / 100),
                borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,.1)', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: true },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: tickColor } }, tooltip: { mode: 'index', intersect: false } },
            scales: baseScales,
          },
        });
      }

      if (c3Ref.current && allMonths.length) {
        charts.current.c3 = new Chart(c3Ref.current, {
          type: 'bar',
          data: {
            labels: allMonths.map(monthLabel),
            datasets: methods.map(meth => ({
              label: METHOD_LABEL[meth], data: allMonths.map(m => (monthlyMatrix.get(m)?.[meth] ?? 0) / 100),
              backgroundColor: METHOD_COLORS[meth], borderRadius: 3, borderSkipped: false,
            })),
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: tickColor } }, tooltip: { mode: 'index', intersect: false } },
            scales: { x: { ...baseScales.x, stacked: true }, y: { ...baseScales.y, stacked: true } },
          },
        });
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, installments]);

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Indicateur: 'CA attendu', Valeur: totalDue / 100 },
      { Indicateur: 'CA encaissé', Valeur: totalPaid / 100 },
      { Indicateur: 'Reste à encaisser', Valeur: resteAEncaisser / 100 },
      { Indicateur: 'Taux de recouvrement (%)', Valeur: tauxRecouvrement },
      { Indicateur: 'Montant en retard', Valeur: montantEnRetard / 100 },
      { Indicateur: 'Total remboursé', Valeur: totalRefunded / 100 },
    ]), 'KPIs');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      allMonths.map(m => ({
        Mois: monthLabel(m),
        Chèque: (monthlyMatrix.get(m)?.cheque ?? 0) / 100,
        Virement: (monthlyMatrix.get(m)?.transfer ?? 0) / 100,
        Espèces: (monthlyMatrix.get(m)?.cash ?? 0) / 100,
        'Total encaissé': methods.reduce((s, meth) => s + (monthlyMatrix.get(m)?.[meth] ?? 0), 0) / 100,
        Attendu: (monthlyExpected.get(m) ?? 0) / 100,
      }))
    ), 'Mensuel');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      Object.entries(dueByPlan).map(([id, amount]) => ({ Formule: pricingPlanLabels[id] ?? id, 'CA attendu': amount / 100 }))
    ), 'Formules');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      refundEntries.map(p => ({ Compte: nameByPlanId[p.id] ?? p.userId, Montant: (p.refundAmount ?? 0) / 100, Mode: METHOD_LABEL[p.refundMethod ?? ''] ?? p.refundMethod }))
    ), 'Remboursements');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      bankDeposits.map(d => ({ Date: d.depositDate, Compte: d.bankAccount, Montant: d.totalAmount / 100, 'Nb chèques': d.chequeCount }))
    ), 'Bordereaux');

    const seasonLabel = seasons.find(s => s.id === selectedSeasonId)?.label ?? selectedSeasonId;
    XLSX.writeFile(wb, `finances_${seasonLabel.replace(/\s+/g, '_')}.xlsx`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/payment-plans" className="text-sm text-gray-400 hover:text-gray-700">← Finances</Link>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord finances</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedSeasonId} onChange={e => setSelectedSeasonId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={handleExport} disabled={loading}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
            Exporter (Excel)
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="CA attendu" value={money(totalDue)} />
            <KpiCard label="CA encaissé" value={money(totalPaid)} accent="text-green-600" />
            <KpiCard label="Reste à encaisser" value={money(resteAEncaisser)} />
            <KpiCard label="Taux de recouvrement" value={`${tauxRecouvrement}%`} />
            <KpiCard label="En retard" value={money(montantEnRetard)} accent={montantEnRetard > 0 ? 'text-red-600' : undefined} />
            <KpiCard label="Remboursé" value={money(totalRefunded)} accent="text-orange-600" />
          </div>

          {/* Statuts des plans */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Plans par statut</p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(statusCounts).map(([status, count]) => (
                <div key={status} className="text-sm">
                  <span className="text-gray-400">{STATUS_LABEL[status] ?? status} :</span>{' '}
                  <span className="font-semibold text-gray-800">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Répartition par mode de paiement</p>
              <div style={{ height: 240 }}><canvas ref={c1Ref} role="img" aria-label="Répartition par mode de paiement" /></div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attendu vs encaissé par mois</p>
              <div style={{ height: 240 }}><canvas ref={c2Ref} role="img" aria-label="Attendu vs encaissé par mois" /></div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Encaissements mensuels par mode</p>
            <div style={{ height: 260 }}><canvas ref={c3Ref} role="img" aria-label="Encaissements mensuels par mode" /></div>
          </div>

          {/* Tableau mensuel */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 overflow-x-auto">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">État mensuel des encaissements par type</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-1.5 pr-3">Mois</th>
                  <th className="py-1.5 pr-3 text-right">Chèque</th>
                  <th className="py-1.5 pr-3 text-right">Virement</th>
                  <th className="py-1.5 pr-3 text-right">Espèces</th>
                  <th className="py-1.5 pr-3 text-right">Total encaissé</th>
                  <th className="py-1.5 text-right">Attendu</th>
                </tr>
              </thead>
              <tbody>
                {allMonths.map(m => {
                  const row = monthlyMatrix.get(m) ?? {};
                  const total = methods.reduce((s, meth) => s + (row[meth] ?? 0), 0);
                  return (
                    <tr key={m} className="border-b border-gray-50">
                      <td className="py-1.5 pr-3 text-gray-700">{monthLabel(m)}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">{money(row.cheque ?? 0)}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">{money(row.transfer ?? 0)}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">{money(row.cash ?? 0)}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold text-gray-900">{money(total)}</td>
                      <td className="py-1.5 text-right text-gray-400">{money(monthlyExpected.get(m) ?? 0)}</td>
                    </tr>
                  );
                })}
                {allMonths.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-gray-400">Aucune donnée pour cette saison</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* CA par formule */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">CA attendu par formule tarifaire</p>
              <div className="space-y-1.5">
                {Object.entries(dueByPlan).sort((a, b) => b[1] - a[1]).map(([id, amount]) => (
                  <div key={id} className="flex justify-between text-sm">
                    <span className="text-gray-700">{pricingPlanLabels[id] ?? id}</span>
                    <span className="font-medium text-gray-900">{money(amount)}</span>
                  </div>
                ))}
                {Object.keys(dueByPlan).length === 0 && <p className="text-sm text-gray-400">Aucune donnée</p>}
              </div>
            </div>

            {/* Suivi bancaire */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Suivi bancaire</p>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-gray-700">Chèques en attente de dépôt ({chequesAwaitingDeposit.length})</span>
                <span className="font-semibold text-orange-600">{money(chequesAwaitingAmount)}</span>
              </div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Derniers bordereaux</p>
              <div className="space-y-1">
                {bankDeposits.slice(0, 6).map(d => (
                  <div key={d.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">{d.depositDate} — {d.bankAccount}</span>
                    <span className="text-gray-800">{money(d.totalAmount)}</span>
                  </div>
                ))}
                {bankDeposits.length === 0 && <p className="text-sm text-gray-400">Aucun bordereau</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Échéances à venir */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Échéances à venir</p>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {upcomingInstallments.map(i => (
                  <div key={i.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">{i.expectedDate} — {nameByPlanId[i.planId] ?? '—'}</span>
                    <span className="text-gray-800">{money(i.amount)}</span>
                  </div>
                ))}
                {upcomingInstallments.length === 0 && <p className="text-sm text-gray-400">Aucune échéance à venir</p>}
              </div>
            </div>

            {/* Retards */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Retards ({lateInstallments.length})</p>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {lateInstallments.map(i => (
                  <div key={i.id} className="flex justify-between text-sm">
                    <span className="text-red-600">{i.expectedDate} — {nameByPlanId[i.planId] ?? '—'}</span>
                    <span className="text-red-700 font-medium">{money(i.amount)}</span>
                  </div>
                ))}
                {lateInstallments.length === 0 && <p className="text-sm text-gray-400">Aucun retard</p>}
              </div>
            </div>
          </div>

          {/* Remboursements */}
          {refundEntries.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Remboursements</p>
              <div className="flex gap-4 mb-3 text-sm">
                {Object.entries(refundsByMethod).map(([method, amount]) => (
                  <span key={method} className="text-gray-600">{METHOD_LABEL[method] ?? method} : <span className="font-medium text-gray-900">{money(amount)}</span></span>
                ))}
              </div>
              <div className="space-y-1">
                {refundEntries.map(p => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">{nameByPlanId[p.id] ?? p.userId}</span>
                    <span className="text-gray-800">{money(p.refundAmount ?? 0)} ({METHOD_LABEL[p.refundMethod ?? ''] ?? p.refundMethod})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
      <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-lg font-bold ${accent ?? 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
