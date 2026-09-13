'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, query } from 'firebase/firestore';

interface BankStatementImportProps {
  seasonId: string;
  userId: string;
  onSuccess: () => void;
}

interface BankAccountOption {
  id: string;
  label: string;
  sortOrder: number;
}

// Détecte le séparateur (virgule ou point-virgule, les deux courants en France)
// et découpe une ligne en respectant les champs entre guillemets.
function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

// Convertit un nombre au format français (1 234,56) ou anglais (1234.56) en float.
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/\s/g, '').replace(/,/g, '.');
  const normalized = cleaned.replace(/\.(?=.*\.)/g, '');
  return parseFloat(normalized);
}

export default function BankStatementImport({ seasonId, userId, onSuccess }: BankStatementImportProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [form, setForm] = useState({
    fileName: '',
    accountId: '',
    month: new Date().toISOString().slice(0, 7),
    bankBalance: '',
  });

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
        setForm((f) => ({ ...f, accountId: f.accountId || data[0]!.id }));
      }
    });
    return () => unsubscribe();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');

    try {
      if (!form.accountId) {
        setError('Sélectionne un compte bancaire');
        return;
      }

      const bankBalance = parseFloat(form.bankBalance);
      if (Number.isNaN(bankBalance)) {
        setError('Le solde bancaire est obligatoire');
        return;
      }

      const text = await file.text();
      const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== '');

      if (lines.length < 2) {
        setError('Le fichier CSV doit avoir au moins une ligne de données');
        return;
      }

      // Détecte le séparateur sur l'en-tête (';' plus fréquent dans les exports bancaires FR)
      const delimiter = lines[0]!.includes(';') ? ';' : ',';

      const entries = lines.slice(1).map((line) => {
        const [date, description, amount] = parseCsvLine(line, delimiter);
        return {
          date: date ?? '',
          description: description ?? '',
          amount: parseAmount(amount ?? '0') || 0,
        };
      }).filter((entry) => entry.date && entry.description);

      if (entries.length === 0) {
        setError('Aucune ligne valide trouvée dans le fichier (format attendu : Date,Description,Montant)');
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
        accountId: form.accountId,
        month: new Date().toISOString().slice(0, 7),
        bankBalance: '',
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'import');
    } finally {
      setLoading(false);
      e.target.value = '';
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
          {bankAccounts.map((acc) => (
            <option key={acc.id} value={acc.id}>{acc.label}</option>
          ))}
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
        <p className="text-xs text-gray-600 mb-2">Format: Date,Description,Montant (virgule ou point-virgule, champs entre guillemets acceptés)</p>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          disabled={loading || !form.accountId}
          className="w-full px-3 py-2 border rounded-lg cursor-pointer"
        />
      </div>

      <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-900">
        <p className="font-medium mb-1">Format CSV attendu :</p>
        <pre className="text-xs">Date,Description,Montant
2026-09-01,Paiement Amazon,-50.00
2026-09-02,"Virement, cotisation Dupont",+1000.00</pre>
      </div>
    </div>
  );
}
