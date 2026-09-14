'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, onSnapshot } from 'firebase/firestore';

interface EntryFormProps {
  seasonId: string;
  userId: string;
  onSuccess: () => void;
}

interface BankAccountOption {
  id: string;
  label: string;
  sortOrder: number;
}

interface Split {
  chartAccount: string;
  analyticsCategory: string;
  eventDetail?: string;
  amount: number;
}

const DEFAULT_ANALYTICS_CATEGORIES = [
  { name: 'Soirées & Événements', description: 'Dépenses liées aux soirées et événements', sortOrder: 1, requiresDetail: false },
  { name: 'Formation & Cours', description: 'Revenus et dépenses de formation', sortOrder: 2, requiresDetail: false },
  { name: 'Adhésions & Cotisations', description: 'Revenus des adhésions', sortOrder: 3, requiresDetail: false },
  { name: 'Subventions', description: 'Revenus de subventions publiques', sortOrder: 4, requiresDetail: false },
  { name: 'Fonctionnement', description: 'Charges de fonctionnement courant', sortOrder: 5, requiresDetail: false },
];

type TransactionType = 'expense' | 'income' | 'transfer';

export default function EntryForm({ seasonId, userId, onSuccess }: EntryFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [categories, setCategories] = useState(DEFAULT_ANALYTICS_CATEGORIES);
  const [chartOptions, setChartOptions] = useState<string[]>([]);
  const [detailOptions, setDetailOptions] = useState<Record<string, string[]>>({});

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    bankAccount: '',
    bankAccountTo: '',
    paymentType: 'virement',
    chequeNumber: '',
    hasReceipt: false,
  });

  const [splitRows, setSplitRows] = useState<Split[]>([
    { chartAccount: '', analyticsCategory: 'Soirées & Événements', eventDetail: '', amount: 0 },
  ]);

  // Tant qu'il n'y a qu'une seule ligne de ventilation, elle suit le montant
  // total saisi en haut du formulaire — dès qu'on ajoute une ligne, chacune
  // devient indépendante.
  useEffect(() => {
    setSplitRows((rows) =>
      rows.length === 1 ? [{ ...rows[0]!, amount: parseFloat(form.amount) || 0 }] : rows,
    );
  }, [form.amount]);

  // Charge les comptes bancaires depuis Finance > Comptes bancaires
  // (collection `bankAccounts`, source unique partagée avec le RIB du club)
  useEffect(() => {
    const q = query(collection(db, 'bankAccounts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: BankAccountOption[] = [];
      snapshot.forEach((doc) => {
        const docData = doc.data();
        data.push({ id: doc.id, label: docData.name ?? doc.id, sortOrder: docData.sortOrder ?? 999 });
      });
      data.sort((a, b) => a.sortOrder - b.sortOrder);
      setBankAccounts(data);
      if (data.length > 0) {
        setForm((f) => ({
          ...f,
          bankAccount: f.bankAccount || data[0]!.id,
          bankAccountTo: f.bankAccountTo || data[1]?.id || data[0]!.id,
        }));
      }
    });
    return () => unsubscribe();
  }, []);

  // Charger les catégories analytiques depuis Firestore
  useEffect(() => {
    const q = query(collection(db, 'analyticsCategories'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach((doc) => {
        const docData = doc.data();
        if (docData.isActive !== false) {
          data.push({
            name: docData.name, description: docData.description, sortOrder: docData.sortOrder,
            requiresDetail: !!docData.requiresDetail,
          });
        }
      });
      if (data.length > 0) {
        setCategories(data.sort((a, b) => a.sortOrder - b.sortOrder));
        setSplitRows((rows) =>
          rows.length === 1 && !rows[0]!.analyticsCategory
            ? [{ ...rows[0]!, analyticsCategory: data[0].name }]
            : rows,
        );
      }
    });
    return () => unsubscribe();
  }, []);

  // Charger les comptes traditionnels (niveau 1, obligatoire)
  useEffect(() => {
    const q = query(collection(db, 'chartOfAccounts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const labels: { label: string; sortOrder: number }[] = [];
      snapshot.forEach((doc) => {
        const docData = doc.data();
        if (docData.isActive !== false) labels.push({ label: docData.label, sortOrder: docData.sortOrder ?? 999 });
      });
      labels.sort((a, b) => a.sortOrder - b.sortOrder);
      const sorted = labels.map((l) => l.label);
      setChartOptions(sorted);
      if (sorted.length > 0) {
        setSplitRows((rows) =>
          rows.length === 1 && !rows[0]!.chartAccount
            ? [{ ...rows[0]!, chartAccount: sorted[0]! }]
            : rows,
        );
      }
    });
    return () => unsubscribe();
  }, []);

  // Charge les détails (niveau 3) de chaque catégorie qui l'exige
  useEffect(() => {
    const q = query(collection(db, 'analyticsCategoryDetails'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const byCategory: Record<string, string[]> = {};
      snapshot.forEach((doc) => {
        const docData = doc.data();
        if (docData.isActive !== false && docData.categoryName) {
          (byCategory[docData.categoryName] ??= []).push(docData.label);
        }
      });
      setDetailOptions(byCategory);
    });
    return () => unsubscribe();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const amount = parseFloat(form.amount);
      if (!amount || amount <= 0) {
        setError('Le montant doit être > 0');
        return;
      }

      if (form.paymentType === 'cheque' && !form.chequeNumber.trim()) {
        setError('Le N° de chèque est obligatoire');
        return;
      }

      if (type !== 'transfer') {
        if (splitRows.some((r) => !r.chartAccount || !r.analyticsCategory)) {
          setError('Chaque ligne de ventilation doit avoir un compte traditionnel et une catégorie.');
          return;
        }
        const missingDetail = splitRows.find((r) => {
          const cat = categories.find((c) => c.name === r.analyticsCategory);
          return cat?.requiresDetail && !r.eventDetail;
        });
        if (missingDetail) {
          setError(`La catégorie "${missingDetail.analyticsCategory}" nécessite un détail.`);
          return;
        }
        if (Math.abs(splitsTotal - amount) > 0.01) {
          setError(`La somme des lignes de ventilation (${splitsTotal.toFixed(2)} €) ne correspond pas au montant (${amount.toFixed(2)} €).`);
          return;
        }
      }

      if (type === 'transfer') {
        // Transfert = débit du compte source + crédit du compte destination
        const sortie = {
          seasonId,
          date: new Date(form.date).getTime(),
          description: form.description,
          amount,
          type: 'expense' as const,
          bankAccount: form.bankAccount,
          analyticsCategory: 'Transfert interne',
          reconciled: false,
          hasReceipt: form.hasReceipt,
          status: 'posted',
          createdAt: Date.now(),
          createdBy: userId,
        };

        const entree = {
          seasonId,
          date: new Date(form.date).getTime(),
          description: form.description,
          amount,
          type: 'income' as const,
          bankAccount: form.bankAccountTo,
          analyticsCategory: 'Transfert interne',
          reconciled: false,
          hasReceipt: form.hasReceipt,
          status: 'posted',
          createdAt: Date.now(),
          createdBy: userId,
        };

        await addDoc(collection(db, 'accountingEntries'), sortie);
        await addDoc(collection(db, 'accountingEntries'), entree);
      } else {
        const entry = {
          seasonId,
          date: new Date(form.date).getTime(),
          description: form.description,
          amount,
          type,
          bankAccount: form.bankAccount,
          paymentType: form.paymentType,
          ...(form.paymentType === 'cheque' && { chequeNumber: form.chequeNumber }),
          analyticsCategory: splitRows[0]!.analyticsCategory,
          splits: splitRows.map((r) => ({
            chartAccount: r.chartAccount,
            analyticsCategory: r.analyticsCategory,
            ...(r.eventDetail && { eventDetail: r.eventDetail }),
            amount: r.amount,
          })),
          reconciled: false,
          hasReceipt: form.hasReceipt,
          status: 'posted',
          createdAt: Date.now(),
          createdBy: userId,
        };

        await addDoc(collection(db, 'accountingEntries'), entry);
      }

      setForm((f) => ({
        ...f,
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        chequeNumber: '',
        hasReceipt: false,
      }));
      setSplitRows((rows) => [{ ...rows[0]!, eventDetail: '', amount: 0 }]);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 text-red-700 p-3 rounded">{error}</div>}

      {/* Type de transaction */}
      <div>
        <label className="block text-sm font-medium mb-2">Type</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
              type === 'expense'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Dépense
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
              type === 'income'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Recette
          </button>
          <button
            type="button"
            onClick={() => setType('transfer')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
              type === 'transfer'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Transfert
          </button>
        </div>
      </div>

      {/* Date */}
      <div>
        <label className="block text-sm font-medium mb-1">Date</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Ex: Billet de train"
          className="w-full px-3 py-2 border rounded-lg"
          required
        />
      </div>

      {/* Montant */}
      <div>
        <label className="block text-sm font-medium mb-1">Montant (€)</label>
        <input
          type="number"
          step="0.01"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="Ex: 150.00"
          className="w-full px-3 py-2 border rounded-lg"
          required
        />
      </div>

      {/* Compte bancaire (Dépense/Recette) */}
      {type !== 'transfer' && (
        <div>
          <label className="block text-sm font-medium mb-1">Compte</label>
          <select
            value={form.bankAccount}
            onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            {bankAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Comptes pour transfert */}
      {type === 'transfer' && (
        <div className="space-y-3 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700 font-medium">🔄 Transfert entre comptes</p>
          <div>
            <label className="block text-sm font-medium mb-1">De (compte source)</label>
            <select
              value={form.bankAccount}
              onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Vers (compte destination)</label>
            <select
              value={form.bankAccountTo}
              onChange={(e) => setForm({ ...form, bankAccountTo: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Type de paiement */}
      <div>
        <label className="block text-sm font-medium mb-1">Type de paiement</label>
        <select
          value={form.paymentType}
          onChange={(e) => setForm({ ...form, paymentType: e.target.value, chequeNumber: '' })}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="virement">Virement</option>
          <option value="cheque">Chèque</option>
          <option value="cb">Carte bancaire</option>
          <option value="especes">Espèces</option>
          <option value="autre">Autre</option>
        </select>
      </div>

      {/* N° de chèque (conditionnel) */}
      {form.paymentType === 'cheque' && (
        <div>
          <label className="block text-sm font-medium mb-1">N° de chèque</label>
          <input
            type="text"
            value={form.chequeNumber}
            onChange={(e) => setForm({ ...form, chequeNumber: e.target.value })}
            placeholder="Ex: 123456"
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
      )}

      {/* Facture correspondante */}
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={form.hasReceipt}
          onChange={(e) => setForm({ ...form, hasReceipt: e.target.checked })}
          className="w-4 h-4"
        />
        Facture correspondante disponible
      </label>

      {type !== 'transfer' && (
        <div>
          <label className="block text-sm font-medium mb-2">Ventilation</label>
          <div className="space-y-2">
            {splitRows.map((row, idx) => {
              const cat = categories.find((c) => c.name === row.analyticsCategory);
              return (
                <div key={idx} className="space-y-2 p-3 bg-gray-50 rounded-lg border">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={row.chartAccount}
                      onChange={(e) => handleSplitRowChange(idx, { chartAccount: e.target.value })}
                      className="px-2 py-1.5 border rounded-lg text-sm"
                    >
                      <option value="">Compte traditionnel...</option>
                      {chartOptions.map((label) => (
                        <option key={label} value={label}>{label}</option>
                      ))}
                    </select>
                    <select
                      value={row.analyticsCategory}
                      onChange={(e) => handleSplitRowChange(idx, { analyticsCategory: e.target.value, eventDetail: '' })}
                      className="px-2 py-1.5 border rounded-lg text-sm"
                    >
                      <option value="">Catégorie...</option>
                      {categories.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2 items-start">
                    {cat?.requiresDetail ? (
                      <select
                        value={row.eventDetail || ''}
                        onChange={(e) => handleSplitRowChange(idx, { eventDetail: e.target.value })}
                        className="px-2 py-1.5 border rounded-lg text-sm"
                      >
                        <option value="">Détail (requis)...</option>
                        {(detailOptions[row.analyticsCategory] || []).map((label) => (
                          <option key={label} value={label}>{label}</option>
                        ))}
                      </select>
                    ) : <div />}
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount || ''}
                        onChange={(e) => handleSplitRowChange(idx, { amount: parseFloat(e.target.value) || 0 })}
                        placeholder="Montant"
                        className="flex-1 px-2 py-1.5 border rounded-lg text-sm"
                      />
                      {splitRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSplitRow(idx)}
                          className="px-2 text-red-600 hover:text-red-800"
                          title="Retirer cette ligne"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              onClick={handleAddSplitRow}
              className="text-sm text-blue-600 hover:underline"
            >
              + Ajouter une ligne
            </button>
            {splitRows.length > 1 && (
              <p className="text-sm text-gray-600">
                Total lignes : <span className="font-mono font-semibold">{splitsTotal.toFixed(2)} €</span> / {(parseFloat(form.amount) || 0).toFixed(2)} €
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bouton */}
      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium"
      >
        {loading ? 'Création...' : 'Créer l\'écriture'}
      </button>
    </form>
  );
}
