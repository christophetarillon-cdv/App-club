'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import BankStatementImport from '@/components/accounting/BankStatementImport';
import ReconciliationMatcher from '@/components/accounting/ReconciliationMatcher';

interface BankStatement {
  id: string;
  seasonId: string;
  accountId: string;
  month: string;
  fileName: string;
  bankBalance: number;
  entries: Array<{
    date: string;
    description: string;
    amount: number;
  }>;
  status: 'imported' | 'reconciling' | 'reconciled';
  createdAt: number;
}

export default function ReconciliationPage() {
  const { user } = useAuth();
  const [bankStatements, setBankStatements] = useState<BankStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonId, setSeasonId] = useState('2024-2025');
  const [showImport, setShowImport] = useState(false);
  const [matchingStatementId, setMatchingStatementId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'bankStatements'),
      where('seasonId', '==', seasonId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: BankStatement[] = [];
      snapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() } as BankStatement);
      });
      setBankStatements(docs.sort((a, b) => b.createdAt - a.createdAt));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, seasonId]);

  if (!user) return <div>Authentification requise</div>;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Rapprochement bancaire</h1>
          <p className="text-gray-600 mt-1">Importez et réconciliez vos relevés bancaires</p>
        </div>
        <button
          onClick={() => setShowImport(!showImport)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
        >
          {showImport ? 'Fermer' : '+ Importer un relevé'}
        </button>
      </div>

      {/* Sélection saison */}
      <div>
        <label className="block text-sm font-medium mb-2">Saison</label>
        <select
          value={seasonId}
          onChange={(e) => setSeasonId(e.target.value)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="2024-2025">Saison 2024-2025</option>
          <option value="2025-2026">Saison 2025-2026</option>
        </select>
      </div>

      {/* Formulaire d'import */}
      {showImport && (
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Importer un relevé bancaire</h2>
          <BankStatementImport
            seasonId={seasonId}
            userId={user.uid}
            onSuccess={() => setShowImport(false)}
          />
        </div>
      )}

      {/* Liste des relevés */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold">Relevés importés</h2>
        </div>

        {loading ? (
          <div className="p-6 text-center text-gray-500">Chargement...</div>
        ) : bankStatements.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Aucun relevé pour cette saison</div>
        ) : (
          <div className="divide-y">
            {bankStatements.map((stmt) => (
              <div key={stmt.id} className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-semibold text-lg">{stmt.fileName}</p>
                    <p className="text-sm text-gray-600">
                      Compte: {stmt.accountId} | Mois: {stmt.month}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {stmt.entries.length} transactions
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-600">
                      {stmt.bankBalance.toFixed(2)} €
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Solde bancaire</p>
                    <span className={`inline-block mt-2 px-2 py-1 rounded text-xs font-medium ${
                      stmt.status === 'reconciled'
                        ? 'bg-green-100 text-green-700'
                        : stmt.status === 'reconciling'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {stmt.status === 'reconciled' ? 'Réconcilié' :
                       stmt.status === 'reconciling' ? 'En cours' : 'Importé'}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded p-4 max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left pb-2 font-semibold">Date</th>
                        <th className="text-left pb-2 font-semibold">Description</th>
                        <th className="text-right pb-2 font-semibold">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stmt.entries.map((entry, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="py-2">{entry.date}</td>
                          <td className="py-2">{entry.description.substring(0, 40)}</td>
                          <td className={`py-2 text-right font-mono ${
                            entry.amount >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {entry.amount >= 0 ? '+' : ''}{entry.amount.toFixed(2)} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={() => setMatchingStatementId(matchingStatementId === stmt.id ? null : stmt.id)}
                  className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
                >
                  {matchingStatementId === stmt.id ? 'Fermer le matching' : 'Réconcilier ce relevé'}
                </button>

                {matchingStatementId === stmt.id && (
                  <div className="mt-6 pt-6 border-t">
                    <h3 className="text-lg font-semibold mb-4">Matching des transactions</h3>
                    <ReconciliationMatcher
                      bankStatementId={stmt.id}
                      accountId={stmt.accountId}
                      transactions={stmt.entries}
                      seasonId={seasonId}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
