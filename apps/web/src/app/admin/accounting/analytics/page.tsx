'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';

interface Split {
  chartAccount: string;
  analyticsCategory: string;
  eventDetail?: string;
  amount: number;
}

interface Entry {
  id: string;
  type?: 'expense' | 'income';
  amount?: number;
  analyticsCategory?: string;
  status?: string;
  splits?: Split[];
}

interface ChartAccountOption {
  label: string;
  type?: 'charge' | 'produit';
  group?: string;
  sortOrder?: number;
}

interface CategoryAgg {
  name: string;
  income: number;
  expense: number;
  count: number;
  details: Record<string, { income: number; expense: number; count: number }>;
}

interface AccountAgg {
  label: string;
  amount: number;
  count: number;
  type?: 'charge' | 'produit';
  group?: string;
  sortOrder?: number;
}

const getSplits = (entry: Entry): Split[] => {
  if (entry.splits && entry.splits.length > 0) return entry.splits;
  return [{ chartAccount: '', analyticsCategory: entry.analyticsCategory || 'Non classé', amount: entry.amount ?? 0 }];
};

export default function AnalyticsPage() {
  const [seasons, setSeasons] = useState<string[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'category' | 'account'>('category');
  const [includeDraft, setIncludeDraft] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [presidentName, setPresidentName] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'clubProfile', 'main')).then((snap) => {
      setPresidentName(snap.data()?.presidentName ?? '');
    });
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, 'seasons'), orderBy('label', 'desc'))).then((snapshot) => {
      const labels = snapshot.docs.map((d) => d.data().label as string);
      setSeasons(labels);
      if (labels.length > 0) {
        const active = snapshot.docs.find((d) => d.data().isActive)?.data().label;
        setSeasonId(active || labels[0]);
      }
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'chartOfAccounts')), (snapshot) => {
      const list: ChartAccountOption[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.isActive !== false) {
          list.push({ label: data.label, type: data.type, group: data.group, sortOrder: data.sortOrder ?? 999 });
        }
      });
      setChartAccounts(list);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!seasonId) return;
    setLoading(true);
    const unsubscribe = onSnapshot(
      query(collection(db, 'accountingEntries'), where('seasonId', '==', seasonId)),
      (snapshot) => {
        const list: Entry[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Entry));
        setEntries(list);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [seasonId]);

  const filteredEntries = useMemo(
    () => entries.filter((e) => includeDraft || e.status === 'posted'),
    [entries, includeDraft],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredEntries.forEach((entry) => {
      getSplits(entry).forEach((split) => {
        if (entry.type === 'income') income += split.amount;
        else expense += split.amount;
      });
    });
    return { income, expense, net: income - expense };
  }, [filteredEntries]);

  const categoryAggs = useMemo(() => {
    const map = new Map<string, CategoryAgg>();
    filteredEntries.forEach((entry) => {
      getSplits(entry).forEach((split) => {
        const key = split.analyticsCategory || 'Non classé';
        const agg = map.get(key) ?? { name: key, income: 0, expense: 0, count: 0, details: {} };
        if (entry.type === 'income') agg.income += split.amount;
        else agg.expense += split.amount;
        agg.count += 1;
        if (split.eventDetail) {
          const d = agg.details[split.eventDetail] ?? { income: 0, expense: 0, count: 0 };
          if (entry.type === 'income') d.income += split.amount;
          else d.expense += split.amount;
          d.count += 1;
          agg.details[split.eventDetail] = d;
        }
        map.set(key, agg);
      });
    });
    return Array.from(map.values()).sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
  }, [filteredEntries]);

  const accountAggs = useMemo(() => {
    const map = new Map<string, AccountAgg>();
    const infoByLabel = new Map(chartAccounts.map((c) => [c.label, c]));
    filteredEntries.forEach((entry) => {
      getSplits(entry).forEach((split) => {
        const key = split.chartAccount || 'Non classé';
        const info = infoByLabel.get(key);
        const agg = map.get(key) ?? { label: key, amount: 0, count: 0, type: info?.type, group: info?.group, sortOrder: info?.sortOrder };
        agg.amount += split.amount;
        agg.count += 1;
        map.set(key, agg);
      });
    });
    return Array.from(map.values());
  }, [filteredEntries, chartAccounts]);

  const produits = accountAggs.filter((a) => a.type === 'produit').sort((a, b) => b.amount - a.amount);
  const charges = accountAggs.filter((a) => a.type === 'charge').sort((a, b) => b.amount - a.amount);
  const nonClasse = accountAggs.filter((a) => a.type !== 'produit' && a.type !== 'charge');
  const totalProduits = produits.reduce((s, a) => s + a.amount, 0);
  const totalCharges = charges.reduce((s, a) => s + a.amount, 0);

  const handleExportCategories = () => {
    const rows: (string | number)[][] = [
      [`Ventilation par catégorie analytique — Saison ${seasonId}`],
      [],
      ['Catégorie', 'Recettes (€)', 'Dépenses (€)', 'Solde (€)', 'Écritures'],
      ...categoryAggs.map((c) => [c.name, c.income, c.expense, c.income - c.expense, c.count]),
      ['Total', totals.income, totals.expense, totals.net, filteredEntries.length],
      [],
      ['Totaux généraux'],
      ['Total recettes', totals.income],
      ['Total dépenses', totals.expense],
      ['Résultat net', totals.net],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 11 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Par catégorie');
    XLSX.writeFile(wb, `ventilation_categories_${seasonId}.xlsx`);
  };

  const handleExportAccounts = () => {
    const rows: (string | number)[][] = [
      [`Ventilation par compte traditionnel — Saison ${seasonId}`],
      [],
      ['Produits'],
      ['Compte', 'Montant (€)', 'Écritures'],
      ...produits.map((a) => [a.label, a.amount, a.count]),
      ['Total produits', totalProduits, ''],
      [],
      ['Charges'],
      ['Compte', 'Montant (€)', 'Écritures'],
      ...charges.map((a) => [a.label, a.amount, a.count]),
      ['Total charges', totalCharges, ''],
    ];
    if (nonClasse.length > 0) {
      rows.push([], ['Non classé'], ['Compte', 'Montant (€)', 'Écritures']);
      nonClasse.forEach((a) => rows.push([a.label, a.amount, a.count]));
    }
    rows.push(
      [],
      ['Totaux généraux'],
      ['Total recettes', totals.income],
      ['Total dépenses', totals.expense],
      ['Résultat net', totals.net],
      ['Résultat (comptes classés uniquement)', totalProduits - totalCharges],
    );
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 11 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Par compte');
    XLSX.writeFile(wb, `ventilation_comptes_${seasonId}.xlsx`);
  };

  const handleExportDetail = (category: CategoryAgg) => {
    const details = Object.entries(category.details);
    const detailIncome = details.reduce((s, [, d]) => s + d.income, 0);
    const detailExpense = details.reduce((s, [, d]) => s + d.expense, 0);
    const detailCount = details.reduce((s, [, d]) => s + d.count, 0);
    const rows: (string | number)[][] = [
      [`Détail — ${category.name} — Saison ${seasonId}`],
      [],
      ['Détail', 'Recettes (€)', 'Dépenses (€)', 'Écritures'],
      ...details.map(([detail, d]) => [detail, d.income, d.expense, d.count]),
      ['Total', detailIncome, detailExpense, detailCount],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 11 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, category.name.substring(0, 31));
    XLSX.writeFile(wb, `detail_${category.name.replace(/\s+/g, '_')}.xlsx`);
  };

  // Construit les lignes d'un côté (Produits ou Charges) du compte de
  // résultat : comptes groupés (avec sous-total) puis comptes sans groupe,
  // triés par ordre d'affichage des comptes traditionnels.
  const buildResultSide = (accounts: AccountAgg[], totalLabel: string): (string | number)[][] => {
    const grouped = new Map<string, AccountAgg[]>();
    const ungrouped: AccountAgg[] = [];
    accounts.forEach((a) => {
      if (a.group) {
        if (!grouped.has(a.group)) grouped.set(a.group, []);
        grouped.get(a.group)!.push(a);
      } else {
        ungrouped.push(a);
      }
    });

    const groupEntries = Array.from(grouped.entries()).sort(([, accsA], [, accsB]) => {
      const minA = Math.min(...accsA.map((a) => a.sortOrder ?? 999));
      const minB = Math.min(...accsB.map((a) => a.sortOrder ?? 999));
      return minA - minB;
    });

    const rows: (string | number)[][] = [];
    groupEntries.forEach(([groupName, accs]) => {
      accs.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
      accs.forEach((a) => rows.push([a.label, a.amount]));
      rows.push([`Total ${groupName}`, accs.reduce((s, a) => s + a.amount, 0)]);
      rows.push(['', '']);
    });
    ungrouped
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
      .forEach((a) => rows.push([a.label, a.amount]));
    rows.push([totalLabel, accounts.reduce((s, a) => s + a.amount, 0)]);
    return rows;
  };

  const handleExportResultReport = () => {
    const leftBody = buildResultSide(produits, 'Total produits');
    const rightBody = buildResultSide(charges, 'Total charges');
    const maxLen = Math.max(leftBody.length, rightBody.length);

    const rows: (string | number)[][] = [
      [`Compte de résultat — Saison ${seasonId}`],
      [],
      ['Produits', '', '', 'Charges', ''],
    ];
    for (let i = 0; i < maxLen; i++) {
      const l = leftBody[i] ?? ['', ''];
      const r = rightBody[i] ?? ['', ''];
      rows.push([l[0]!, l[1]!, '', r[0]!, r[1]!]);
    }
    rows.push([]);
    rows.push(['Total recettes', totalProduits, '', 'Total charges', totalCharges]);
    rows.push(['', '', '', 'Résultat', totalProduits - totalCharges]);
    rows.push(['TOTAL EQUILIBRE', totalProduits, '', 'TOTAL EQUILIBRE', totalProduits]);
    rows.push([]);
    if (nonClasse.length > 0) {
      rows.push([`${nonClasse.length} compte(s) non classé(s) exclus de ce total — voir l'onglet Par compte traditionnel.`]);
      rows.push([]);
    }
    rows.push([`Certifié exact par : ${presidentName || '____________________'}`]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 3 }, { wch: 32 }, { wch: 14 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Compte de résultat');
    XLSX.writeFile(wb, `compte_resultat_${seasonId}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <select
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            {seasons.map((label) => (
              <option key={label} value={label}>Saison {label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDraft}
              onChange={(e) => setIncludeDraft(e.target.checked)}
              className="w-4 h-4"
            />
            Inclure les brouillons
          </label>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportResultReport}
            disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium text-sm"
          >
            Exporter le compte de résultat
          </button>
          <button
            onClick={tab === 'category' ? handleExportCategories : handleExportAccounts}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
          >
            Exporter Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-gray-500">Total recettes</p>
          <p className="text-2xl font-bold text-green-600">{totals.income.toFixed(2)} €</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-gray-500">Total dépenses</p>
          <p className="text-2xl font-bold text-red-600">{totals.expense.toFixed(2)} €</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-gray-500">Résultat net</p>
          <p className={`text-2xl font-bold ${totals.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {totals.net.toFixed(2)} €
          </p>
        </div>
      </div>

      <div className="flex gap-4 border-b">
        <button
          onClick={() => setTab('category')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            tab === 'category' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Par catégorie analytique
        </button>
        <button
          onClick={() => setTab('account')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            tab === 'account' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Par compte traditionnel
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-gray-500">Chargement...</div>
      ) : tab === 'category' ? (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 text-left font-semibold">Catégorie</th>
                <th className="px-4 py-3 text-right font-semibold">Recettes</th>
                <th className="px-4 py-3 text-right font-semibold">Dépenses</th>
                <th className="px-4 py-3 text-right font-semibold">Solde</th>
                <th className="px-4 py-3 text-right font-semibold">Écritures</th>
              </tr>
            </thead>
            <tbody>
              {categoryAggs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucune écriture pour cette saison</td></tr>
              )}
              {categoryAggs.map((cat) => {
                const hasDetails = Object.keys(cat.details).length > 0;
                const expanded = expandedCategory === cat.name;
                return (
                  <Fragment key={cat.name}>
                    <tr className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-center">
                        {hasDetails && (
                          <button
                            onClick={() => setExpandedCategory(expanded ? null : cat.name)}
                            className="w-8 h-8 flex items-center justify-center text-xl text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded"
                            title={expanded ? 'Masquer le détail' : 'Afficher le détail'}
                          >
                            {expanded ? '▾' : '▸'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{cat.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-600">{cat.income.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right font-mono text-red-600">{cat.expense.toFixed(2)} €</td>
                      <td className={`px-4 py-3 text-right font-mono ${cat.income - cat.expense >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(cat.income - cat.expense).toFixed(2)} €
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{cat.count}</td>
                    </tr>
                    {expanded && hasDetails && (
                      <tr key={`${cat.name}-detail`} className="bg-gray-50 border-b">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-gray-600">Détail</p>
                            <button
                              onClick={() => handleExportDetail(cat)}
                              className="px-3 py-1 bg-white border rounded text-xs font-medium hover:bg-gray-100"
                            >
                              Exporter ce détail
                            </button>
                          </div>
                          <table className="w-full text-sm bg-white rounded border overflow-hidden">
                            <thead>
                              <tr className="border-b">
                                <th className="px-3 py-2 text-left font-medium text-gray-600">Détail</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-600">Recettes</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-600">Dépenses</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-600">Écritures</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(cat.details).map(([detail, d]) => (
                                <tr key={detail} className="border-t">
                                  <td className="px-3 py-2">{detail}</td>
                                  <td className="px-3 py-2 text-right font-mono">{d.income.toFixed(2)} €</td>
                                  <td className="px-3 py-2 text-right font-mono">{d.expense.toFixed(2)} €</td>
                                  <td className="px-3 py-2 text-right text-gray-500">{d.count}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {categoryAggs.length > 0 && (
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right font-mono text-green-600">{totals.income.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600">{totals.expense.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right font-mono">{totals.net.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right text-gray-500">{filteredEntries.length}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-green-700 mb-2">Produits</p>
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Compte</th>
                    <th className="px-4 py-3 text-right font-semibold">Montant</th>
                    <th className="px-4 py-3 text-right font-semibold">Écritures</th>
                  </tr>
                </thead>
                <tbody>
                  {produits.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-400">Aucun compte de produit ventilé</td></tr>
                  )}
                  {produits.map((a) => (
                    <tr key={a.label} className="border-b">
                      <td className="px-4 py-3">{a.label}</td>
                      <td className="px-4 py-3 text-right font-mono">{a.amount.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right text-gray-500">{a.count}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3">Total produits</td>
                    <td className="px-4 py-3 text-right font-mono text-green-600">{totalProduits.toFixed(2)} €</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-red-700 mb-2">Charges</p>
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Compte</th>
                    <th className="px-4 py-3 text-right font-semibold">Montant</th>
                    <th className="px-4 py-3 text-right font-semibold">Écritures</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-400">Aucun compte de charge ventilé</td></tr>
                  )}
                  {charges.map((a) => (
                    <tr key={a.label} className="border-b">
                      <td className="px-4 py-3">{a.label}</td>
                      <td className="px-4 py-3 text-right font-mono">{a.amount.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right text-gray-500">{a.count}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3">Total charges</td>
                    <td className="px-4 py-3 text-right font-mono text-red-600">{totalCharges.toFixed(2)} €</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {nonClasse.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-orange-700 mb-2">Non classé</p>
              <p className="text-xs text-gray-500 mb-2">
                Comptes sans type Charge/Produit configuré, ou écritures sans compte traditionnel — à
                corriger dans Paramètres pour qu'ils apparaissent dans le résultat.
              </p>
              <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {nonClasse.map((a) => (
                      <tr key={a.label} className="border-b">
                        <td className="px-4 py-3">{a.label}</td>
                        <td className="px-4 py-3 text-right font-mono">{a.amount.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right text-gray-500">{a.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white p-4 rounded-lg border flex justify-between items-center">
            <span className="font-semibold">Résultat (produits - charges)</span>
            <span className={`font-mono font-bold text-lg ${totalProduits - totalCharges >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {(totalProduits - totalCharges).toFixed(2)} €
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
