'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';

interface BankTransaction {
  date: string;
  description: string;
  amount: number;
  matchedEntryId?: string;
}

interface Entry {
  id: string;
  date: number;
  description: string;
  amount: number;
  type: 'expense' | 'income';
}

interface ReconciliationMatcherProps {
  bankStatementId: string;
  accountId: string;
  entries: BankTransaction[];
}

const MAX_DAYS_APART = 3;

export default function ReconciliationMatcher({
  bankStatementId,
  accountId,
  entries,
}: ReconciliationMatcherProps) {
  const [candidates, setCandidates] = useState<Entry[]>([]);
  const [matchedEntries, setMatchedEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(true);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [error, setError] = useState('');

  const matchedIdsKey = entries.map((e) => e.matchedEntryId ?? '').join(',');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const q = query(
          collection(db, 'accountingEntries'),
          where('bankAccount', '==', accountId),
          where('reconciled', '==', false),
        );
        const snapshot = await getDocs(q);
        const list: Entry[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (typeof data.amount === 'number' && data.type) {
            list.push({ id: d.id, date: data.date, description: data.description, amount: data.amount, type: data.type });
          }
        });
        setCandidates(list.sort((a, b) => b.date - a.date));

        const matchedIds = entries.map((e) => e.matchedEntryId).filter((id): id is string => !!id);
        if (matchedIds.length > 0) {
          const docs = await Promise.all(matchedIds.map((id) => getDoc(doc(db, 'accountingEntries', id))));
          const map: Record<string, Entry> = {};
          docs.forEach((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              map[snap.id] = { id: snap.id, date: data.date, description: data.description, amount: data.amount, type: data.type };
            }
          });
          setMatchedEntries(map);
        } else {
          setMatchedEntries({});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    };

    load();
    // matchedIdsKey capture les changements de matching (autre onglet, autre session)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, bankStatementId, matchedIdsKey]);

  const updateMatch = async (idx: number, matchedEntryId: string | null) => {
    setBusyIdx(idx);
    setError('');
    try {
      const previousId = entries[idx]?.matchedEntryId;
      const newEntries: BankTransaction[] = entries.map((e, i): BankTransaction => {
        if (i !== idx) return e;
        const { matchedEntryId: _drop, ...rest } = e;
        return matchedEntryId ? { ...rest, matchedEntryId } : rest;
      });
      const matchedCount = newEntries.filter((e) => e.matchedEntryId).length;
      const status = matchedCount === 0 ? 'imported' : matchedCount === newEntries.length ? 'reconciled' : 'reconciling';

      const batch = writeBatch(db);
      batch.update(doc(db, 'bankStatements', bankStatementId), { entries: newEntries, status });
      if (matchedEntryId) {
        batch.update(doc(db, 'accountingEntries', matchedEntryId), { reconciled: true });
      } else if (previousId) {
        batch.update(doc(db, 'accountingEntries', previousId), { reconciled: false });
      }
      await batch.commit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du matching');
    } finally {
      setBusyIdx(null);
    }
  };

  if (loading) return <div className="text-center text-gray-500 py-6">Chargement des écritures...</div>;

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}

      {entries.map((tx, txIdx) => {
        const matched = tx.matchedEntryId ? matchedEntries[tx.matchedEntryId] : undefined;
        const candidatesForTx = candidates.filter((e) => {
          const diffDays = Math.abs(e.date - new Date(tx.date).getTime()) / 86400000;
          const sameSign = (tx.amount >= 0 && e.type === 'income') || (tx.amount < 0 && e.type === 'expense');
          const sameAmount = Math.abs(e.amount - Math.abs(tx.amount)) < 0.01;
          return diffDays <= MAX_DAYS_APART && sameSign && sameAmount;
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
              <div className="flex items-center justify-between p-3 bg-green-100 border border-green-300 rounded text-sm text-green-700">
                <span>✓ Matched avec « {matched.description} » ({new Date(matched.date).toLocaleDateString('fr-FR')})</span>
                <button
                  onClick={() => updateMatch(txIdx, null)}
                  disabled={busyIdx === txIdx}
                  className="px-3 py-1 bg-white border border-green-400 text-green-700 rounded text-sm font-medium hover:bg-green-50 disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {candidatesForTx.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium mb-2">Écritures correspondantes ({candidatesForTx.length}):</p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {candidatesForTx.map((entry) => (
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
                            onClick={() => updateMatch(txIdx, entry.id)}
                            disabled={busyIdx === txIdx}
                            className="px-3 py-1 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
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
          <strong>{entries.filter((e) => e.matchedEntryId).length}/{entries.length}</strong> transactions matchées
        </p>
      </div>
    </div>
  );
}
