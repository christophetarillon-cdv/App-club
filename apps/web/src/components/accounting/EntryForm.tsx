'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, onSnapshot } from 'firebase/firestore';

interface EntryFormProps {
  seasonId: string;
  userId: string;
  onSuccess: () => void;
}

const BANK_ACCOUNTS = [
  { code: 'CE_PRINCIPAL', label: 'Caisse Épargne Principale' },
  { code: 'CE_LIVRET', label: 'Caisse Épargne - Livret' },
  { code: 'PAYPAL', label: 'PayPal' },
  { code: 'STRIPE', label: 'Stripe' },
  { code: 'CAISSE', label: 'Caisse espèces' },
];

const DEFAULT_ANALYTICS_CATEGORIES = [
  { name: 'Soirées & Événements', description: 'Dépenses liées aux soirées et événements', sortOrder: 1 },
  { name: 'Formation & Cours', description: 'Revenus et dépenses de formation', sortOrder: 2 },
  { name: 'Adhésions & Cotisations', description: 'Revenus des adhésions', sortOrder: 3 },
  { name: 'Subventions', description: 'Revenus de subventions publiques', sortOrder: 4 },
  { name: 'Fonctionnement', description: 'Charges de fonctionnement courant', sortOrder: 5 },
];

type TransactionType = 'expense' | 'income' | 'transfer';

export default function EntryForm({ seasonId, userId, onSuccess }: EntryFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [bankAccounts, setBankAccounts] = useState(BANK_ACCOUNTS);
  const [categories, setCategories] = useState(DEFAULT_ANALYTICS_CATEGORIES);

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    bankAccount: 'CE_PRINCIPAL',
    bankAccountTo: 'CE_LIVRET',
    paymentType: 'virement',
    chequeNumber: '',
    analyticsCategory: 'Soirées & Événements',
  });

  // Charger les comptes bancaires depuis Firestore
  useEffect(() => {
    const q = query(collection(db, 'bankAccounts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach((doc) => {
        const docData = doc.data();
        if (docData.isActive !== false) {
          data.push({ code: docData.code, label: docData.label, sortOrder: docData.sortOrder });
        }
      });
      if (data.length > 0) {
        setBankAccounts(data.sort((a, b) => a.sortOrder - b.sortOrder));
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
          data.push({ name: docData.name, description: docData.description, sortOrder: docData.sortOrder });
        }
      });
      if (data.length > 0) {
        setCategories(data.sort((a, b) => a.sortOrder - b.sortOrder));
        setForm((f) => ({ ...f, analyticsCategory: data[0].name }));
      }
    });
    return () => unsubscribe();
  }, []);

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
          analyticsCategory: form.analyticsCategory,
          reconciled: false,
          status: 'posted',
          createdAt: Date.now(),
          createdBy: userId,
        };

        await addDoc(collection(db, 'accountingEntries'), entry);
      }

      setForm({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        bankAccount: 'CE_PRINCIPAL',
        bankAccountTo: 'CE_LIVRET',
        paymentType: 'virement',
        chequeNumber: '',
        analyticsCategory: 'Soirées & Événements',
      });
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
              <option key={acc.code} value={acc.code}>
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
                <option key={acc.code} value={acc.code}>
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
                <option key={acc.code} value={acc.code}>
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

      {/* Catégorie analytique */}
      <div>
        <label className="block text-sm font-medium mb-1">Catégorie</label>
        <select
          value={form.analyticsCategory}
          onChange={(e) => setForm({ ...form, analyticsCategory: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        >
          {categories.map((cat) => (
            <option key={cat.name} value={cat.name}>
              {cat.name}
            </option>
          ))}
        </select>
        {categories.find(c => c.name === form.analyticsCategory)?.description && (
          <p className="text-xs text-gray-500 mt-1">
            {categories.find(c => c.name === form.analyticsCategory)?.description}
          </p>
        )}
      </div>

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
