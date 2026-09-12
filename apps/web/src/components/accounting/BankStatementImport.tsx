'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

interface BankStatementImportProps {
  seasonId: string;
  userId: string;
  onSuccess: () => void;
}

export default function BankStatementImport({ seasonId, userId, onSuccess }: BankStatementImportProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    fileName: '',
    accountId: 'CE_PRINCIPAL',
    month: new Date().toISOString().slice(0, 7),
    bankBalance: '',
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');

    try {
      const text = await file.text();
      const lines = text.trim().split('\n');

      if (lines.length < 2) {
        setError('Le fichier CSV doit avoir au moins une ligne de données');
        return;
      }

      // Parser le CSV simple : Date,Description,Montant
      const entries = lines.slice(1).map((line) => {
        const [date, description, amount] = line.split(',').map(s => s.trim());
        return {
          date,
          description,
          amount: parseFloat(amount) || 0,
        };
      });

      const bankBalance = parseFloat(form.bankBalance);
      if (!bankBalance) {
        setError('Le solde bancaire est obligatoire');
        return;
      }

      const statement = {
        seasonId,
        accountId: form.accountId,
        month: form.month,
        fileName: form.fileName || file.name,
        bankBalance,
        entries,
        status: 'imported' as const,
        uploadedBy: userId,
        createdAt: Date.now(),
      };

      await addDoc(collection(db, 'bankStatements'), statement);
      setForm({
        fileName: '',
        accountId: 'CE_PRINCIPAL',
        month: new Date().toISOString().slice(0, 7),
        bankBalance: '',
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'import');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 text-red-700 p-3 rounded">{error}</div>}

      <div>
        <label className="block text-sm font-medium mb-2">Compte bancaire</label>
        <select
          value={form.accountId}
          onChange={(e) => setForm({ ...form, accountId: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="CE_PRINCIPAL">Caisse Épargne Principale</option>
          <option value="CE_LIVRET">Caisse Épargne - Livret</option>
          <option value="PAYPAL">PayPal</option>
          <option value="STRIPE">Stripe</option>
          <option value="CAISSE">Caisse espèces</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Mois</label>
        <input
          type="month"
          value={form.month}
          onChange={(e) => setForm({ ...form, month: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Solde bancaire (€)</label>
        <input
          type="number"
          step="0.01"
          value={form.bankBalance}
          onChange={(e) => setForm({ ...form, bankBalance: e.target.value })}
          placeholder="Ex: 5000.00"
          className="w-full px-3 py-2 border rounded-lg"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Fichier CSV</label>
        <p className="text-xs text-gray-600 mb-2">Format: Date,Description,Montant</p>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          disabled={loading}
          className="w-full px-3 py-2 border rounded-lg cursor-pointer"
        />
      </div>

      <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-900">
        <p className="font-medium mb-1">Format CSV attendu :</p>
        <pre className="text-xs">Date,Description,Montant
2026-09-01,Paiement Amazon,-50.00
2026-09-02,Virement reçu,+1000.00</pre>
      </div>
    </div>
  );
}
