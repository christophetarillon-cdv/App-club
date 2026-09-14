'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore';
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
        if (data.isActive !== false) list.push({ label: data.label, type: data.type });
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
    const typeByLabel = new Map(chartAccounts.map((c) => [c.label, c.type]));
    filteredEntries.forEach((entry) => {
      getSplits(entry).forEach((split) => {
        const key = split.chartAccount || 'Non classé';
        const agg = map.get(key) ?? { label: key, amount: 0, count: 0, type: typeByLabel.get(key) };
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
    const data = categoryAggs.map((c) => ({
      'Catégorie': c.name,
      'Recettes (€)': c.income.toFixed(2),
      'Dépenses (€)': c.expense.toFixed(2),
      'Solde (€)': (c.income - c.expense).toFixed(2),
      'Écritures': c.count,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Par catégorie');
    XLSX.writeFile(wb, `ventilation_categories_${seasonId}.xlsx`);
  };

  const handleExportAccounts = () => {
    const data = [
      ...produits.map((a) => ({ Section: 'Produits', Compte: a.label, 'Montant (€)': a.amount.toFixed(2), Écritures: a.count })),
      { Section: '', Compte: 'Total produits', 'Montant (€)': totalProduits.toFixed(2), Écritures: '' },
      ...charges.map((a) => ({ Section: 'Charges', Compte: a.label, 'Montant (€)': a.amount.toFixed(2), Écritures: a.count })),
      { Section: '', Compte: 'Total charges', 'Montant (€)': totalCharges.toFixed(2), Écritures: '' },
      ...nonClasse.map((a) => ({ Section: 'Non classé', Compte: a.label, 'Montant (€)': a.amount.toFixed(2), Écritures: a.count })),
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Par compte');
    XLSX.writeFile(wb, `ventilation_comptes_${seasonId}.xlsx`);
  };

  const handleExportDetail = (category: CategoryAgg) => {
    const data = Object.entries(category.details).map(([detail, d]) => ({
      'Détail': detail,
      'Recettes (€)': d.income.toFixed(2),
      'Dépenses (€)': d.expense.toFixed(2),
      'Écritures': d.count,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, category.name.substring(0, 31));
    XLSX.writeFile(wb, `detail_${category.name.replace(/\s+/g, '_')}.xlsx`);
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
        <button
          onClick={tab === 'category' ? handleExportCategories : handleExportAccounts}
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
        >
          Exporter Excel
        </button>
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
                          <button onClick={() => setExpandedCategory(expanded ? null : cat.name)} className="text-gray-400 hover:text-gray-700">
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
