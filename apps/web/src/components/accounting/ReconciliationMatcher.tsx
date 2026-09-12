'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

interface BankTransaction {
  date: string;
  description: string;
  amount: number;
}

interface Entry {
  id: string;
  date: number;
  description: string;
  amount: number;
  bankAccount: string;
  reconciled: boolean;
}

interface ReconciliationMatcherProps {
  bankStatementId: string;
  accountId: string;
  transactions: BankTransaction[];
  seasonId: string;
}

export default function ReconciliationMatcher({
  bankStatementId,
  accountId,
  transactions,
  seasonId,
}: ReconciliationMatcherProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Record<number, string>>({});

  useEffect(() => {
    const loadEntries = async () => {
      try {
        const q = query(
          collection(db, 'accountingEntries'),
          where('seasonId', '==', seasonId),
          where('bankAccount', '==', accountId),
          where('reconciled', '==', false)
        );
        const snapshot = await getDocs(q);
        const data: Entry[] = [];
        snapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() } as Entry);
        });
        setEntries(data.sort((a, b) => b.date - a.date));
      } catch (err) {
        console.error('Erreur:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEntries();
  }, [seasonId, accountId]);

  const handleMatch = async (txIdx: number, entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    try {
      const entryRef = doc(db, 'accountingEntries', entryId);
      await updateDoc(entryRef, {
        reconciled: true,
      });

      setMatches({ ...matches, [txIdx]: entryId });
      setEntries(entries.filter((e) => e.id !== entryId));
    } catch (err) {
      console.error('Erreur lors du matching:', err);
    }
  };

  if (loading) return <div className="text-center text-gray-500 py-6">Chargement des écritures...</div>;

  return (
    <div className="space-y-6">
      {transactions.map((tx, txIdx) => {
        const matched = matches[txIdx];
        const candidates = entries.filter((e) => {
          const entryDate = new Date(e.date).toISOString().split('T')[0];
          const txDate = tx.date;
          const sameDayOrNextDay = new Date(entryDate) >= new Date(txDate) &&
                                   new Date(entryDate) <= new Date(new Date(txDate).getTime() + 86400000);
          const sameAmount = Math.abs(e.amount - Math.abs(tx.amount)) < 0.01;
          return sameDayOrNextDay && sameAmount;
        });

        return (
          <div
            key={txIdx}
            className={`border rounded-lg p-4 ${
              matched ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'
            }`}
          >
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-600">Date relevé</p>
                <p className="font-mono">{tx.date}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Description</p>
                <p className="font-medium text-sm">{tx.description.substring(0, 40)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Montant</p>
                <p className={`font-mono font-bold ${
                  tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)} €
                </p>
              </div>
            </div>

            {matched ? (
              <div className="p-3 bg-green-100 border border-green-300 rounded text-sm text-green-700">
                ✓ Matched avec écriture comptable
              </div>
            ) : (
              <div className="space-y-2">
                {candidates.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium mb-2">Écritures correspondantes ({candidates.length}):</p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {candidates.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200 hover:border-blue-400 transition"
                        >
                          <div>
                            <p className="text-sm font-medium">{entry.description}</p>
                            <p className="text-xs text-gray-600">
                              {new Date(entry.date).toLocaleDateString('fr-FR')} · {entry.amount.toFixed(2)} €
                            </p>
                          </div>
                          <button
                            onClick={() => handleMatch(txIdx, entry.id)}
                            className="px-3 py-1 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-600"
                          >
                            Match
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-yellow-50 border border-yellow-300 rounded text-sm text-yellow-700">
                    ⚠️ Aucune écriture correspondante trouvée
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Résumé */}
      <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>{Object.keys(matches).length}/{transactions.length}</strong> transactions matchées
        </p>
      </div>
    </div>
  );
}
