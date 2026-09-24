'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, updateDoc,
} from 'firebase/firestore';
import { METHOD_LABEL, type PaymentMethod } from '@/lib/payment-constants';

interface BankDeposit {
  id: string;
  depositDate: string;
  paymentMethod: PaymentMethod;
  label?: string;
  bankAccountId: string;
  bankAccountName: string;
  totalAmount: number; // centimes
  itemCount: number;
  accountingEntryId?: string;
}

interface SeasonRange {
  label: string;
  start: Date;
  end: Date;
  isActive: boolean;
}

interface Split {
  chartAccount: string;
  analyticsCategory: string;
  eventDetail?: string;
  amount: number;
}

interface BankDepositImportProps {
  userId: string;
  onImported?: (seasonId: string) => void;
}

export default function BankDepositImport({ userId, onImported }: BankDepositImportProps) {
  const [deposits, setDeposits] = useState<BankDeposit[]>([]);
  const [seasons, setSeasons] = useState<SeasonRange[]>([]);
  const [chartOptions, setChartOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ name: string; requiresDetail: boolean }[]>([]);
  const [detailOptions, setDetailOptions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [splitRows, setSplitRows] = useState<Split[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'seasons')).then((snap) => {
      const list: SeasonRange[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const start = data.startDate?.toDate?.();
        const end = data.endDate?.toDate?.();
        if (start && end) {
          list.push({ label: data.label, start, end, isActive: !!data.isActive });
        }
      });
      setSeasons(list);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'bankDeposits'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: BankDeposit[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (!data.accountingEntryId) {
          list.push({
            id: d.id,
            depositDate: data.depositDate,
            paymentMethod: data.paymentMethod,
            label: data.label,
            bankAccountId: data.bankAccountId,
            bankAccountName: data.bankAccountName,
            totalAmount: data.totalAmount,
            itemCount: data.itemCount,
          });
        }
      });
      setDeposits(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Comptes traditionnels, catégories analytiques et leurs détails (niveaux
  // 1/2/3 de ventilation) — mêmes listes que le Journal, mais restreintes aux
  // comptes de type "produit" : une mise en banque est toujours une recette
  // (type: 'income' à l'import, voir handleConfirmImport), un compte de
  // charge n'a donc pas de sens ici.
  useEffect(() => {
    const unsubChart = onSnapshot(query(collection(db, 'chartOfAccounts')), (snapshot) => {
      const labels: string[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.isActive !== false && data.type === 'produit') labels.push(data.label);
      });
      setChartOptions(labels);
    });
    const unsubCategories = onSnapshot(query(collection(db, 'analyticsCategories')), (snapshot) => {
      const cats: { name: string; requiresDetail: boolean }[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.isActive !== false) cats.push({ name: data.name, requiresDetail: !!data.requiresDetail });
      });
      setCategoryOptions(cats);
    });
    const unsubDetails = onSnapshot(query(collection(db, 'analyticsCategoryDetails')), (snapshot) => {
      const byCategory: Record<string, string[]> = {};
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.isActive !== false && data.categoryName) {
          (byCategory[data.categoryName] ??= []).push(data.label);
        }
      });
      setDetailOptions(byCategory);
    });
    return () => {
      unsubChart();
      unsubCategories();
      unsubDetails();
    };
  }, []);

  const resolveSeasonId = (depositDateStr: string): string => {
    const depositDate = new Date(depositDateStr);
    const found = seasons.find((s) => depositDate >= s.start && depositDate <= s.end);
    if (found) return found.label;
    const active = seasons.find((s) => s.isActive);
    return active?.label ?? seasons[0]?.label ?? '';
  };

  const handleStartVentilate = (deposit: BankDeposit) => {
    setExpandedId(deposit.id);
    setError('');
    setSuccess('');
    setSplitRows([{
      chartAccount: chartOptions[0] || '',
      analyticsCategory: categoryOptions[0]?.name || '',
      eventDetail: '',
      amount: deposit.totalAmount / 100,
    }]);
  };

  const handleAddSplitRow = () => {
    setSplitRows((rows) => [...rows, { chartAccount: '', analyticsCategory: '', eventDetail: '', amount: 0 }]);
  };

  const handleRemoveSplitRow = (idx: number) => {
    setSplitRows((rows) => rows.filter((_, i) => i !== idx));
  };

  const handleSplitRowChange = (idx: number, patch: Partial<Split>) => {
    setSplitRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const splitsTotal = splitRows.reduce((sum, r) => sum + (r.amount || 0), 0);

  const handleConfirmImport = async (deposit: BankDeposit) => {
    setError('');

    if (splitRows.some((r) => !r.chartAccount || !r.analyticsCategory)) {
      setError('Chaque ligne doit avoir un compte traditionnel et une catégorie.');
      return;
    }
    const missingDetail = splitRows.find((r) => {
      const cat = categoryOptions.find((c) => c.name === r.analyticsCategory);
      return cat?.requiresDetail && !r.eventDetail;
    });
    if (missingDetail) {
      setError(`La catégorie "${missingDetail.analyticsCategory}" nécessite un détail.`);
      return;
    }
    const total = deposit.totalAmount / 100;
    if (Math.abs(splitsTotal - total) > 0.01) {
      setError(`La somme des lignes (${splitsTotal.toFixed(2)} €) ne correspond pas au montant du bordereau (${total.toFixed(2)} €).`);
      return;
    }

    setImportingId(deposit.id);
    try {
      const seasonId = resolveSeasonId(deposit.depositDate);
      if (!seasonId) {
        setError('Impossible de déterminer la saison pour cette date — vérifie les saisons configurées.');
        return;
      }

      const entryRef = await addDoc(collection(db, 'accountingEntries'), {
        seasonId,
        date: new Date(deposit.depositDate).getTime(),
        description: deposit.label || `Remise en banque - ${METHOD_LABEL[deposit.paymentMethod] ?? 'divers'} (${deposit.itemCount})`,
        amount: total,
        type: 'income',
        bankAccount: deposit.bankAccountId,
        analyticsCategory: splitRows[0]!.analyticsCategory,
        splits: splitRows.map((r) => ({
          chartAccount: r.chartAccount,
          analyticsCategory: r.analyticsCategory,
          ...(r.eventDetail && { eventDetail: r.eventDetail }),
          amount: r.amount,
        })),
        reconciled: false,
        hasReceipt: true,
        statementNumber: null,
        status: 'posted',
        createdAt: Date.now(),
        createdBy: userId,
        sourceBankDepositId: deposit.id,
      });

      await updateDoc(doc(db, 'bankDeposits', deposit.id), {
        accountingEntryId: entryRef.id,
      });

      setSuccess(`Écriture ajoutée à la saison ${seasonId}.`);
      setExpandedId(null);
      setSplitRows([]);
      onImported?.(seasonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'import');
    } finally {
      setImportingId(null);
    }
  };

  if (loading) return null;
  if (deposits.length === 0 && !success) return null;

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50">
        <h2 className="text-lg font-semibold">Mises en banque à importer ({deposits.length})</h2>
        <p className="text-sm text-gray-500 mt-1">
          Bordereaux de remise en banque générés depuis Finance, pas encore intégrés au journal comptable.
        </p>
      </div>
      {success && <div className="mx-6 mt-4 bg-green-50 text-green-700 p-3 rounded text-sm">{success}</div>}
      <div className="divide-y">
        {deposits.map((deposit) => (
          <div key={deposit.id} className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {deposit.label || `Remise ${METHOD_LABEL[deposit.paymentMethod] ?? 'divers'}`}
                  <span className="ml-2 text-xs text-gray-500">
                    {new Date(deposit.depositDate).toLocaleDateString('fr-FR')} · {deposit.bankAccountName} · {deposit.itemCount} élément(s)
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p className="font-mono font-semibold text-green-600">
                  +{(deposit.totalAmount / 100).toFixed(2)} €
                </p>
                <button
                  onClick={() => (expandedId === deposit.id ? setExpandedId(null) : handleStartVentilate(deposit))}
                  className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
                >
                  {expandedId === deposit.id ? 'Fermer' : 'Ventiler et importer'}
                </button>
              </div>
            </div>

            {expandedId === deposit.id && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border space-y-2">
                {error && <div className="bg-red-50 text-red-700 p-2 rounded text-sm">{error}</div>}
                {splitRows.map((row, idx) => {
                  const cat = categoryOptions.find((c) => c.name === row.analyticsCategory);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-white p-2 rounded border">
                      <select
                        value={row.chartAccount}
                        onChange={(e) => handleSplitRowChange(idx, { chartAccount: e.target.value })}
                        className="col-span-3 px-2 py-1.5 border rounded text-sm"
                      >
                        <option value="">Compte traditionnel...</option>
                        {chartOptions.map((label) => (
                          <option key={label} value={label}>{label}</option>
                        ))}
                      </select>
                      <select
                        value={row.analyticsCategory}
                        onChange={(e) => handleSplitRowChange(idx, { analyticsCategory: e.target.value, eventDetail: '' })}
                        className="col-span-3 px-2 py-1.5 border rounded text-sm"
                      >
                        <option value="">Catégorie...</option>
                        {categoryOptions.map((c) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      {cat?.requiresDetail ? (
                        <select
                          value={row.eventDetail || ''}
                          onChange={(e) => handleSplitRowChange(idx, { eventDetail: e.target.value })}
                          className={`col-span-3 px-2 py-1.5 border rounded text-sm ${!row.eventDetail ? 'border-orange-400' : ''}`}
                        >
                          <option value="">Détail (requis)...</option>
                          {(detailOptions[row.analyticsCategory] || []).map((label) => (
                            <option key={label} value={label}>{label}</option>
                          ))}
                        </select>
                      ) : <div className="col-span-3" />}
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount || ''}
                        onChange={(e) => handleSplitRowChange(idx, { amount: parseFloat(e.target.value) || 0 })}
                        className="col-span-2 px-2 py-1.5 border rounded text-sm"
                      />
                      <button
                        onClick={() => handleRemoveSplitRow(idx)}
                        disabled={splitRows.length <= 1}
                        className="col-span-1 px-2 py-1.5 text-red-600 hover:text-red-800 disabled:opacity-30 text-sm"
                        title="Retirer cette ligne"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between">
                  <button onClick={handleAddSplitRow} className="text-sm text-blue-600 hover:underline">
                    + Ajouter une ligne
                  </button>
                  <p className="text-sm text-gray-600">
                    Total lignes : <span className="font-mono font-semibold">{splitsTotal.toFixed(2)} €</span> / {(deposit.totalAmount / 100).toFixed(2)} €
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConfirmImport(deposit)}
                    disabled={importingId === deposit.id}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                  >
                    {importingId === deposit.id ? 'Import...' : 'Confirmer l\'import'}
                  </button>
                  <button
                    onClick={() => { setExpandedId(null); setSplitRows([]); setError(''); }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-400"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
