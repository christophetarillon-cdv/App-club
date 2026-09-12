'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import EntryForm from '@/components/accounting/EntryForm';
import EntryTable from '@/components/accounting/EntryTable';

interface Entry {
  id: string;
  date: number;
  description: string;
  amount?: number;
  type?: 'expense' | 'income';
  debit?: { accountCode: string; amount: number };
  credit?: { accountCode: string; amount: number };
  bankAccount: string;
  paymentType?: string;
  chequeNumber?: string;
  analyticsCategory?: string;
  reconciled: boolean;
  status: 'draft' | 'posted';
  createdAt: number;
}

export default function JournalPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonId, setSeasonId] = useState('2024-2025');
  const [filter, setFilter] = useState<'all' | 'draft' | 'posted'>('all');
  const [showForm, setShowForm] = useState(false);

  // Charge les écritures de la saison
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'accountingEntries'),
      where('seasonId', '==', seasonId),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs: Entry[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (filter === 'all' || data.status === filter) {
            docs.push({ id: doc.id, ...data } as Entry);
          }
        });
        setEntries(docs);
        setLoading(false);
      },
      (error) => {
        console.error('Erreur Firestore:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, seasonId, filter]);

  if (!user) return <div>Authentification requise</div>;

  return (
    <div className="space-y-6">
      {/* En-tête avec boutons */}
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <select
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="2024-2025">Saison 2024-2025</option>
            <option value="2025-2026">Saison 2025-2026</option>
          </select>

          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-2 rounded-lg ${
                filter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100'
              }`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilter('draft')}
              className={`px-3 py-2 rounded-lg ${
                filter === 'draft' ? 'bg-blue-500 text-white' : 'bg-gray-100'
              }`}
            >
              Brouillon
            </button>
            <button
              onClick={() => setFilter('posted')}
              className={`px-3 py-2 rounded-lg ${
                filter === 'posted' ? 'bg-blue-500 text-white' : 'bg-gray-100'
              }`}
            >
              Validées
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          {showForm ? 'Fermer' : '+ Nouvelle écriture'}
        </button>
      </div>

      {/* Formulaire de saisie */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">Nouvelle écriture comptable</h3>
          <EntryForm
            seasonId={seasonId}
            onSuccess={() => setShowForm(false)}
            userId={user.uid}
          />
        </div>
      )}

      {/* Tableau des écritures */}
      <div className="bg-white rounded-lg border">
        <EntryTable entries={entries} loading={loading} seasonId={seasonId} />
      </div>

      {/* Statistiques */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-500">Total dépenses</p>
            <p className="text-2xl font-bold text-red-600">
              {entries
                .filter(e => e.type === 'expense')
                .reduce((sum, e) => sum + (e.amount || 0), 0)
                .toFixed(2)} €
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-500">Total recettes</p>
            <p className="text-2xl font-bold text-green-600">
              {entries
                .filter(e => e.type === 'income')
                .reduce((sum, e) => sum + (e.amount || 0), 0)
                .toFixed(2)} €
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-500">Nombre d'écritures</p>
            <p className="text-2xl font-bold">{entries.length}</p>
          </div>
        </div>
      )}
    </div>
  );
}
