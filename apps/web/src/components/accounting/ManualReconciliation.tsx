'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  addDoc, collection, doc, getDocs, query, where, writeBatch,
} from 'firebase/firestore';

interface BankAccountOption {
  id: string;
  name: string;
  sortOrder: number;
  openingBalance: number;
}

interface Entry {
  id: string;
  date: number;
  description: string;
  amount: number;
  type: 'expense' | 'income';
}

interface EntryDraft {
  checked: boolean;
  valueDate: string;
  hasReceipt: boolean;
}

const signedAmount = (e: Entry) => (e.type === 'expense' ? -e.amount : e.amount);

export default function ManualReconciliation() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [accountId, setAccountId] = useState('');
  const [statementNumber, setStatementNumber] = useState('');
  const [finalBalance, setFinalBalance] = useState('');
  const [reconciledSum, setReconciledSum] = useState(0);
  const [unreconciled, setUnreconciled] = useState<Entry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EntryDraft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'bankAccounts')).then((snap) => {
      const data: BankAccountOption[] = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name ?? d.id,
        sortOrder: d.data().sortOrder ?? 999,
        openingBalance: d.data().openingBalance ?? 0,
      }));
      data.sort((a, b) => a.sortOrder - b.sortOrder);
      setAccounts(data);
      if (data.length > 0) setAccountId((current) => current || data[0]!.id);
    });
  }, []);

  const account = accounts.find((a) => a.id === accountId);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    setError('');
    setSuccess('');
    setDrafts({});

    Promise.all([
      getDocs(query(
        collection(db, 'accountingEntries'),
        where('bankAccount', '==', accountId),
        where('reconciled', '==', true),
      )),
      getDocs(query(
        collection(db, 'accountingEntries'),
        where('bankAccount', '==', accountId),
        where('reconciled', '==', false),
      )),
    ]).then(([reconciledSnap, unreconciledSnap]) => {
      let sum = 0;
      reconciledSnap.forEach((d) => {
        const data = d.data();
        if (typeof data.amount === 'number' && data.type) {
          sum += signedAmount({ id: d.id, ...data } as Entry);
        }
      });
      setReconciledSum(sum);

      const list: Entry[] = [];
      unreconciledSnap.forEach((d) => {
        const data = d.data();
        if (typeof data.amount === 'number' && data.type) {
          list.push({ id: d.id, date: data.date, description: data.description, amount: data.amount, type: data.type });
        }
      });
      list.sort((a, b) => b.date - a.date);
      setUnreconciled(list);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }).finally(() => {
      setLoading(false);
    });
  }, [accountId]);

  const toggleChecked = (entryId: string) => {
    setDrafts((prev) => {
      const existing = prev[entryId];
      if (existing?.checked) {
        return { ...prev, [entryId]: { ...existing, checked: false } };
      }
      return {
        ...prev,
        [entryId]: {
          checked: true,
          valueDate: existing?.valueDate || new Date().toISOString().split('T')[0]!,
          hasReceipt: existing?.hasReceipt ?? false,
        },
      };
    });
  };

  const setValueDate = (entryId: string, valueDate: string) => {
    setDrafts((prev) => ({ ...prev, [entryId]: { ...prev[entryId]!, valueDate } }));
  };

  const setHasReceipt = (entryId: string, hasReceipt: boolean) => {
    setDrafts((prev) => ({ ...prev, [entryId]: { ...prev[entryId]!, hasReceipt } }));
  };

  const checkedEntries = useMemo(
    () => unreconciled.filter((e) => drafts[e.id]?.checked),
    [unreconciled, drafts],
  );

  const checkedSum = checkedEntries.reduce((sum, e) => sum + signedAmount(e), 0);
  const openingBalance = account?.openingBalance ?? 0;
  const computedBalance = openingBalance + reconciledSum + checkedSum;
  const finalBalanceNum = parseFloat(finalBalance);
  const hasFinalBalance = finalBalance.trim() !== '' && !Number.isNaN(finalBalanceNum);
  const diff = hasFinalBalance ? finalBalanceNum - computedBalance : null;
  const isBalanced = diff !== null && Math.abs(diff) < 0.01;

  const handleValidate = async () => {
    if (!user || !accountId || checkedEntries.length === 0) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const batch = writeBatch(db);
      checkedEntries.forEach((entry) => {
        const draft = drafts[entry.id]!;
        batch.update(doc(db, 'accountingEntries', entry.id), {
          reconciled: true,
          valueDate: new Date(draft.valueDate).getTime(),
          hasReceipt: draft.hasReceipt,
          statementNumber: statementNumber || null,
        });
      });
      await batch.commit();

      await addDoc(collection(db, 'bankReconciliations'), {
        accountId,
        statementNumber: statementNumber || null,
        openingBalance,
        finalBalance: hasFinalBalance ? finalBalanceNum : null,
        computedBalance,
        isBalanced,
        entryIds: checkedEntries.map((e) => e.id),
        createdAt: Date.now(),
        createdBy: user.uid,
      });

      setSuccess(`${checkedEntries.length} écriture(s) rapprochée(s).`);
      setStatementNumber('');
      setFinalBalance('');
      setUnreconciled((prev) => prev.filter((e) => !drafts[e.id]?.checked));
      setReconciledSum((sum) => sum + checkedSum);
      setDrafts({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la validation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Compte</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">N° du relevé</label>
            <input
              type="text"
              value={statementNumber}
              onChange={(e) => setStatementNumber(e.target.value)}
              placeholder="Ex: 2026-09"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Solde final du relevé (€)</label>
            <input
              type="number"
              step="0.01"
              value={finalBalance}
              onChange={(e) => setFinalBalance(e.target.value)}
              placeholder="Ex: 5000.00"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-sm bg-gray-50 rounded-lg p-4">
          <div>
            <p className="text-gray-500">Solde initial</p>
            <p className="font-mono font-semibold">{openingBalance.toFixed(2)} €</p>
          </div>
          <div>
            <p className="text-gray-500">Déjà rapproché</p>
            <p className="font-mono font-semibold">{reconciledSum.toFixed(2)} €</p>
          </div>
          <div>
            <p className="text-gray-500">Coché maintenant</p>
            <p className="font-mono font-semibold">{checkedSum.toFixed(2)} €</p>
          </div>
          <div>
            <p className="text-gray-500">Solde calculé</p>
            <p className="font-mono font-semibold">{computedBalance.toFixed(2)} €</p>
          </div>
        </div>

        {hasFinalBalance && (
          <div className={`p-3 rounded text-sm font-medium ${isBalanced ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
            {isBalanced
              ? '✅ Rapprochement OK — le solde calculé correspond au relevé'
              : `⚠️ Écart de ${diff!.toFixed(2)} € entre le solde calculé et le relevé`}
          </div>
        )}

        {error && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 p-3 rounded text-sm">{success}</div>}
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Écritures non rapprochées</h2>
          <button
            onClick={handleValidate}
            disabled={saving || checkedEntries.length === 0}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium text-sm"
          >
            {saving ? 'Validation...' : `Valider le rapprochement (${checkedEntries.length})`}
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-gray-500">Chargement...</div>
        ) : unreconciled.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Aucune écriture non rapprochée pour ce compte</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-center font-semibold w-10">✓</th>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Libellé</th>
                <th className="px-4 py-3 text-right font-semibold">Montant</th>
                <th className="px-4 py-3 text-left font-semibold">Date de valeur</th>
                <th className="px-4 py-3 text-center font-semibold">Facture</th>
              </tr>
            </thead>
            <tbody>
              {unreconciled.map((entry) => {
                const draft = drafts[entry.id];
                return (
                  <tr key={entry.id} className={`border-b ${draft?.checked ? 'bg-green-50' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={draft?.checked ?? false}
                        onChange={() => toggleChecked(entry.id)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">{new Date(entry.date).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3">{entry.description}</td>
                    <td className={`px-4 py-3 text-right font-mono ${entry.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                      {entry.type === 'expense' ? '-' : '+'}{entry.amount.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={draft?.valueDate ?? ''}
                        disabled={!draft?.checked}
                        onChange={(e) => setValueDate(entry.id, e.target.value)}
                        className="px-2 py-1 border rounded text-sm disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={draft?.hasReceipt ?? false}
                        disabled={!draft?.checked}
                        onChange={(e) => setHasReceipt(entry.id, e.target.checked)}
                        className="w-4 h-4 cursor-pointer disabled:opacity-40"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
