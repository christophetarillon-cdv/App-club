'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';

interface Split {
  chartAccount: string;
  analyticsCategory: string;
  eventDetail?: string;
  amount: number;
}

interface Entry {
  id: string;
  seasonId?: string;
  bankAccount: string;
  type?: 'expense' | 'income';
  amount?: number;
  status?: string;
  reconciled?: boolean;
  hasReceipt?: boolean;
  splits?: Split[];
}

interface BankAccountInfo {
  id: string;
  name: string;
  openingBalance: number;
  sortOrder: number;
}

interface SeasonInfo {
  id: string;
  label: string;
  startDate: Date | null;
}

const signedAmount = (e: Entry) => (e.type === 'expense' ? -(e.amount ?? 0) : (e.amount ?? 0));

const isUnclassified = (e: Entry) => {
  if (!e.splits || e.splits.length === 0) return true;
  return e.splits.some((s) => !s.chartAccount);
};

export default function ReportsPage() {
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccountInfo[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [chartAccountTypedCount, setChartAccountTypedCount] = useState({ total: 0, untyped: 0 });
  const [loading, setLoading] = useState(true);
  const [initialCumulativeResult, setInitialCumulativeResult] = useState(0);
  const [initialDraft, setInitialDraft] = useState('0');
  const [savingInitial, setSavingInitial] = useState(false);
  const [balanceInputs, setBalanceInputs] = useState({ immobilisations: 0, dettes: 0 });
  const [balanceDraft, setBalanceDraft] = useState({ immobilisations: '0', dettes: '0' });
  const [savingBalance, setSavingBalance] = useState(false);
  const [receivables, setReceivables] = useState(0);

  useEffect(() => {
    getDocs(query(collection(db, 'seasons'), orderBy('startDate', 'asc'))).then((snapshot) => {
      const list: SeasonInfo[] = snapshot.docs.map((d) => ({
        id: d.id,
        label: d.data().label as string,
        startDate: d.data().startDate?.toDate?.() ?? null,
      }));
      setSeasons(list);
      const activeDoc = snapshot.docs.find((d) => d.data().isActive);
      setSeasonId(activeDoc?.data().label || list[list.length - 1]?.label || '');
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'bankAccounts'), (snapshot) => {
      const list: BankAccountInfo[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({ id: d.id, name: data.name ?? d.id, openingBalance: data.openingBalance ?? 0, sortOrder: data.sortOrder ?? 999 });
      });
      list.sort((a, b) => a.sortOrder - b.sortOrder);
      setBankAccounts(list);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'chartOfAccounts'), (snapshot) => {
      let total = 0;
      let untyped = 0;
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.isActive !== false) {
          total += 1;
          if (!data.type) untyped += 1;
        }
      });
      setChartAccountTypedCount({ total, untyped });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, 'accountingEntries'), (snapshot) => {
      const list: Entry[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Entry));
      setEntries(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Report à nouveau initial (valeur unique, saisie une fois)
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'accountingSettings', 'main'), (snap) => {
      const value = snap.data()?.initialCumulativeResult ?? 0;
      setInitialCumulativeResult(value);
      setInitialDraft(String(value));
    });
    return () => unsubscribe();
  }, []);

  // Saisies manuelles du bilan (immobilisations, dettes) pour la saison sélectionnée
  useEffect(() => {
    if (!seasonId) return;
    const unsubscribe = onSnapshot(doc(db, 'balanceSheetInputs', seasonId), (snap) => {
      const data = snap.data();
      const values = { immobilisations: data?.immobilisations ?? 0, dettes: data?.dettes ?? 0 };
      setBalanceInputs(values);
      setBalanceDraft({ immobilisations: String(values.immobilisations), dettes: String(values.dettes) });
    });
    return () => unsubscribe();
  }, [seasonId]);

  // Créances (cotisations à recevoir) : même calcul que Finances > Tableau
  // de bord — seuls les plans "approved" comptent, totalDue - totalPaid.
  // memberships/paymentGroups stockent seasonId comme l'id Firestore de la
  // saison (pas son libellé comme dans accountingEntries) : on doit résoudre
  // l'id à partir du libellé sélectionné avant d'interroger.
  useEffect(() => {
    const seasonDocId = seasons.find((s) => s.label === seasonId)?.id;
    if (!seasonDocId) return;
    Promise.all([
      getDocs(query(collection(db, 'memberships'), where('seasonId', '==', seasonDocId))),
      getDocs(query(collection(db, 'paymentGroups'), where('seasonId', '==', seasonDocId))),
    ]).then(([membershipSnap, groupSnap]) => {
      let due = 0;
      let paid = 0;
      membershipSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.paymentGroupId) return;
        if (data.paymentPlanStatus !== 'approved') return;
        due += data.totalDue ?? 0;
        paid += data.totalPaid ?? 0;
      });
      groupSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.paymentPlanStatus !== 'approved') return;
        due += data.totalDue ?? 0;
        paid += data.totalPaid ?? 0;
      });
      setReceivables((due - paid) / 100);
    });
  }, [seasonId, seasons]);

  // Bilan de trésorerie : toutes saisons confondues, écritures validées
  // uniquement — un solde de compte est continu dans le temps.
  const treasury = useMemo(() => {
    const posted = entries.filter((e) => e.status === 'posted');
    return bankAccounts.map((acc) => {
      const accEntries = posted.filter((e) => e.bankAccount === acc.id);
      const theoretical = acc.openingBalance + accEntries.reduce((s, e) => s + signedAmount(e), 0);
      const reconciledBalance = acc.openingBalance + accEntries.filter((e) => e.reconciled).reduce((s, e) => s + signedAmount(e), 0);
      return { name: acc.name, theoretical, reconciled: reconciledBalance, gap: theoretical - reconciledBalance };
    });
  }, [bankAccounts, entries]);

  const treasuryTotals = useMemo(() => ({
    theoretical: treasury.reduce((s, t) => s + t.theoretical, 0),
    reconciled: treasury.reduce((s, t) => s + t.reconciled, 0),
    gap: treasury.reduce((s, t) => s + t.gap, 0),
  }), [treasury]);

  const seasonEntries = useMemo(() => entries.filter((e) => e.seasonId === seasonId), [entries, seasonId]);

  const reliability = useMemo(() => {
    const total = seasonEntries.length;
    const posted = seasonEntries.filter((e) => e.status === 'posted').length;
    const draft = total - posted;
    const reconciledCount = seasonEntries.filter((e) => e.reconciled).length;
    const withReceipt = seasonEntries.filter((e) => e.hasReceipt).length;
    const unclassified = seasonEntries.filter(isUnclassified).length;
    return { total, posted, draft, reconciledCount, withReceipt, unclassified };
  }, [seasonEntries]);

  const computeSeasonTotals = (label: string) => {
    let income = 0;
    let expense = 0;
    entries
      .filter((e) => e.seasonId === label && e.status === 'posted')
      .forEach((e) => {
        if (e.type === 'income') income += e.amount ?? 0;
        else expense += e.amount ?? 0;
      });
    return { income, expense, net: income - expense };
  };

  const currentSeasonIndex = seasons.findIndex((s) => s.label === seasonId);
  const previousSeason = currentSeasonIndex > 0 ? seasons[currentSeasonIndex - 1] : null;
  const currentTotals = computeSeasonTotals(seasonId);
  const previousTotals = previousSeason ? computeSeasonTotals(previousSeason.label) : null;

  // Résultat cumulé fin de saison précédente = report initial + résultat de
  // toutes les saisons antérieures à celle sélectionnée.
  const currentSeasonStart = seasons.find((s) => s.label === seasonId)?.startDate;
  const priorSeasons = currentSeasonStart ? seasons.filter((s) => s.startDate && s.startDate < currentSeasonStart) : [];
  const cumulativeResultBeforeSeason = initialCumulativeResult + priorSeasons.reduce((sum, s) => sum + computeSeasonTotals(s.label).net, 0);

  const totalActif = balanceInputs.immobilisations + receivables + treasuryTotals.reconciled;
  const totalPassif = cumulativeResultBeforeSeason + currentTotals.net + balanceInputs.dettes;
  const balanceGap = totalActif - totalPassif;

  const handleSaveInitial = async () => {
    setSavingInitial(true);
    try {
      await setDoc(doc(db, 'accountingSettings', 'main'), {
        initialCumulativeResult: parseFloat(initialDraft) || 0,
        updatedAt: Date.now(),
      }, { merge: true });
    } finally {
      setSavingInitial(false);
    }
  };

  const handleSaveBalanceInputs = async () => {
    setSavingBalance(true);
    try {
      await setDoc(doc(db, 'balanceSheetInputs', seasonId), {
        immobilisations: parseFloat(balanceDraft.immobilisations) || 0,
        dettes: parseFloat(balanceDraft.dettes) || 0,
        updatedAt: Date.now(),
      }, { merge: true });
    } finally {
      setSavingBalance(false);
    }
  };

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    const treasuryRows: (string | number)[][] = [
      ['Bilan de trésorerie (toutes saisons, écritures validées)'],
      [],
      ['Compte', 'Solde théorique (€)', 'Solde pointé (€)', 'Écart (€)'],
      ...treasury.map((t) => [t.name, t.theoretical, t.reconciled, t.gap]),
      ['Total', treasuryTotals.theoretical, treasuryTotals.reconciled, treasuryTotals.gap],
    ];
    const wsTreasury = XLSX.utils.aoa_to_sheet(treasuryRows);
    wsTreasury['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
    wsTreasury['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    XLSX.utils.book_append_sheet(wb, wsTreasury, 'Bilan');

    const reliabilityRows: (string | number)[][] = [
      [`Indicateurs de fiabilité — Saison ${seasonId}`],
      [],
      ['Écritures totales', reliability.total],
      ['Écritures validées', reliability.posted],
      ['Écritures en brouillon', reliability.draft],
      ['Écritures pointées', `${reliability.reconciledCount} / ${reliability.total}`],
      ['Écritures avec facture', `${reliability.withReceipt} / ${reliability.total}`],
      ['Écritures non classées', reliability.unclassified],
      ['Comptes traditionnels non typés', `${chartAccountTypedCount.untyped} / ${chartAccountTypedCount.total}`],
    ];
    const wsReliability = XLSX.utils.aoa_to_sheet(reliabilityRows);
    wsReliability['!cols'] = [{ wch: 32 }, { wch: 18 }];
    wsReliability['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    XLSX.utils.book_append_sheet(wb, wsReliability, 'Fiabilité');

    const comparisonRows: (string | number)[][] = [
      ['Comparaison avec la saison précédente'],
      [],
      ['', `Saison ${seasonId}`, previousSeason ? `Saison ${previousSeason.label}` : 'N/A', 'Évolution'],
      ['Recettes', currentTotals.income, previousTotals?.income ?? '', previousTotals ? currentTotals.income - previousTotals.income : ''],
      ['Dépenses', currentTotals.expense, previousTotals?.expense ?? '', previousTotals ? currentTotals.expense - previousTotals.expense : ''],
      ['Résultat net', currentTotals.net, previousTotals?.net ?? '', previousTotals ? currentTotals.net - previousTotals.net : ''],
    ];
    const wsComparison = XLSX.utils.aoa_to_sheet(comparisonRows);
    wsComparison['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
    wsComparison['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    XLSX.utils.book_append_sheet(wb, wsComparison, 'Comparaison');

    const balanceRows: (string | number)[][] = [
      [`Bilan annuel — Saison ${seasonId}`],
      [],
      ['Actif', '', '', 'Passif', ''],
      ['Immobilisations', balanceInputs.immobilisations, '', 'Résultat cumulé fin ' + (previousSeason?.label ?? '—'), cumulativeResultBeforeSeason],
      ['Créances (cotisations à recevoir)', receivables, '', 'Résultat de la saison', currentTotals.net],
      ...treasury.map((t, i) => (
        i === 0
          ? [t.name, t.reconciled, '', 'Dettes (Fournisseurs, ...)', balanceInputs.dettes]
          : [t.name, t.reconciled, '', '', '']
      )),
      ['Total actif', totalActif, '', 'Total passif', totalPassif],
      [],
      ["Écart (Actif - Passif)", balanceGap],
    ];
    const wsBalance = XLSX.utils.aoa_to_sheet(balanceRows);
    wsBalance['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 3 }, { wch: 32 }, { wch: 14 }];
    wsBalance['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    XLSX.utils.book_append_sheet(wb, wsBalance, 'Bilan annuel');

    XLSX.writeFile(wb, `rapport_${seasonId}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <select
          value={seasonId}
          onChange={(e) => setSeasonId(e.target.value)}
          className="px-3 py-2 border rounded-lg"
        >
          {seasons.slice().reverse().map((s) => (
            <option key={s.label} value={s.label}>Saison {s.label}</option>
          ))}
        </select>
        <button
          onClick={handleExport}
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
        >
          Exporter Excel (4 feuilles)
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-gray-500">Chargement...</div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Bilan de trésorerie</h2>
            <p className="text-sm text-gray-500 mb-3">Toutes saisons confondues, écritures validées uniquement.</p>
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Compte</th>
                    <th className="px-4 py-3 text-right font-semibold">Solde théorique</th>
                    <th className="px-4 py-3 text-right font-semibold">Solde pointé</th>
                    <th className="px-4 py-3 text-right font-semibold">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {treasury.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Aucun compte bancaire configuré</td></tr>
                  )}
                  {treasury.map((t) => (
                    <tr key={t.name} className="border-b">
                      <td className="px-4 py-3">{t.name}</td>
                      <td className="px-4 py-3 text-right font-mono">{t.theoretical.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right font-mono">{t.reconciled.toFixed(2)} €</td>
                      <td className={`px-4 py-3 text-right font-mono ${Math.abs(t.gap) < 0.01 ? 'text-gray-400' : 'text-orange-600'}`}>
                        {t.gap.toFixed(2)} €
                      </td>
                    </tr>
                  ))}
                  {treasury.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right font-mono">{treasuryTotals.theoretical.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right font-mono">{treasuryTotals.reconciled.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right font-mono">{treasuryTotals.gap.toFixed(2)} €</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-1">Indicateurs de fiabilité</h2>
            <p className="text-sm text-gray-500 mb-3">Saison {seasonId}.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg border">
                <p className="text-sm text-gray-500">Écritures validées</p>
                <p className="text-xl font-bold">{reliability.posted} / {reliability.total}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <p className="text-sm text-gray-500">En brouillon</p>
                <p className={`text-xl font-bold ${reliability.draft > 0 ? 'text-orange-600' : ''}`}>{reliability.draft}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <p className="text-sm text-gray-500">Pointées</p>
                <p className="text-xl font-bold">
                  {reliability.total > 0 ? Math.round((reliability.reconciledCount / reliability.total) * 100) : 0}%
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <p className="text-sm text-gray-500">Avec facture</p>
                <p className="text-xl font-bold">
                  {reliability.total > 0 ? Math.round((reliability.withReceipt / reliability.total) * 100) : 0}%
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <p className="text-sm text-gray-500">Écritures non classées</p>
                <p className={`text-xl font-bold ${reliability.unclassified > 0 ? 'text-orange-600' : ''}`}>{reliability.unclassified}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <p className="text-sm text-gray-500">Comptes non typés</p>
                <p className={`text-xl font-bold ${chartAccountTypedCount.untyped > 0 ? 'text-orange-600' : ''}`}>
                  {chartAccountTypedCount.untyped} / {chartAccountTypedCount.total}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-1">Comparaison avec la saison précédente</h2>
            {!previousSeason ? (
              <p className="text-sm text-gray-400">Pas de saison antérieure à comparer.</p>
            ) : (
              <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold"></th>
                      <th className="px-4 py-3 text-right font-semibold">Saison {seasonId}</th>
                      <th className="px-4 py-3 text-right font-semibold">Saison {previousSeason.label}</th>
                      <th className="px-4 py-3 text-right font-semibold">Évolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Recettes', currentTotals.income, previousTotals!.income],
                      ['Dépenses', currentTotals.expense, previousTotals!.expense],
                      ['Résultat net', currentTotals.net, previousTotals!.net],
                    ].map(([label, current, previous]) => (
                      <tr key={label as string} className="border-b">
                        <td className="px-4 py-3 font-medium">{label}</td>
                        <td className="px-4 py-3 text-right font-mono">{(current as number).toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500">{(previous as number).toFixed(2)} €</td>
                        <td className={`px-4 py-3 text-right font-mono ${(current as number) - (previous as number) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {((current as number) - (previous as number)).toFixed(2)} €
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold">Bilan annuel</h2>
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-500">Report à nouveau initial (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={initialDraft}
                  onChange={(e) => setInitialDraft(e.target.value)}
                  className="w-28 px-2 py-1 border rounded"
                />
                <button
                  onClick={handleSaveInitial}
                  disabled={savingInitial || parseFloat(initialDraft) === initialCumulativeResult}
                  className="px-3 py-1 bg-blue-500 text-white rounded font-medium hover:bg-blue-600 disabled:opacity-50"
                >
                  {savingInitial ? '...' : 'Enregistrer'}
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              Saison {seasonId} — comptes au solde pointé. Le report à nouveau initial ne se saisit qu'une seule fois
              (cumul des résultats avant le début de la compta numérique) ; l'application l'additionne ensuite automatiquement saison après saison.
            </p>
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Actif</th>
                    <th className="px-4 py-3 text-right font-semibold">Montant</th>
                    <th className="px-4 py-3 text-left font-semibold">Passif</th>
                    <th className="px-4 py-3 text-right font-semibold">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-3">
                      Immobilisations
                      <input
                        type="number"
                        step="0.01"
                        value={balanceDraft.immobilisations}
                        onChange={(e) => setBalanceDraft({ ...balanceDraft, immobilisations: e.target.value })}
                        className="ml-2 w-24 px-2 py-1 border rounded text-right"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{balanceInputs.immobilisations.toFixed(2)} €</td>
                    <td className="px-4 py-3">Résultat cumulé fin {previousSeason?.label ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{cumulativeResultBeforeSeason.toFixed(2)} €</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3">Créances (cotisations à recevoir)</td>
                    <td className="px-4 py-3 text-right font-mono">{receivables.toFixed(2)} €</td>
                    <td className="px-4 py-3">Résultat de la saison</td>
                    <td className={`px-4 py-3 text-right font-mono ${currentTotals.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {currentTotals.net.toFixed(2)} €
                    </td>
                  </tr>
                  {treasury.map((t, i) => (
                    <tr key={t.name} className="border-b">
                      <td className="px-4 py-3">{t.name}</td>
                      <td className="px-4 py-3 text-right font-mono">{t.reconciled.toFixed(2)} €</td>
                      {i === 0 ? (
                        <>
                          <td className="px-4 py-3">
                            Dettes (Fournisseurs, ...)
                            <input
                              type="number"
                              step="0.01"
                              value={balanceDraft.dettes}
                              onChange={(e) => setBalanceDraft({ ...balanceDraft, dettes: e.target.value })}
                              className="ml-2 w-24 px-2 py-1 border rounded text-right"
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{balanceInputs.dettes.toFixed(2)} €</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3"></td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3">Total actif</td>
                    <td className="px-4 py-3 text-right font-mono">{totalActif.toFixed(2)} €</td>
                    <td className="px-4 py-3">Total passif</td>
                    <td className="px-4 py-3 text-right font-mono">{totalPassif.toFixed(2)} €</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={handleSaveBalanceInputs}
                disabled={savingBalance}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium text-sm"
              >
                {savingBalance ? 'Enregistrement...' : 'Enregistrer immobilisations / dettes'}
              </button>
              <p className={`text-sm font-semibold ${Math.abs(balanceGap) < 0.01 ? 'text-gray-500' : 'text-orange-600'}`}>
                Écart (Actif − Passif) : {balanceGap.toFixed(2)} €
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
