'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/AppShell';
import type { Dancer } from '@cdv/types';

export default function TrombinoscOpePage() {
  const { user } = useAuth();
  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'dancers'), where('isActive', '!=', false)))
      .then(snap => {
        setDancers(
          snap.docs.map(d => ({ id: d.id, ...d.data() } as Dancer))
            .sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr'))
        );
      })
      .finally(() => setLoading(false));
  }, [user]);

  const filtered = search.trim()
    ? dancers.filter(d => d.firstName.toLowerCase().includes(search.toLowerCase()) ||
                          d.lastName.toLowerCase().includes(search.toLowerCase()))
    : dancers;

  const palette = ['bg-blue-400','bg-purple-400','bg-pink-400','bg-green-500','bg-orange-400','bg-teal-500','bg-red-400','bg-indigo-400'];
  const avatarColor = (d: Dancer) => palette[(d.firstName.charCodeAt(0) ?? 0) % palette.length];

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-5">

        {/* Search */}
        <div className="relative mb-5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none">
            <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un danseur…"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        {!loading && (
          <p className="text-xs text-gray-400 mb-3">{filtered.length} danseur{filtered.length !== 1 ? 's' : ''}</p>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 px-6 py-12 text-center">
            <p className="text-gray-500">Aucun danseur trouvé.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
            {filtered.map(dancer => (
              <div key={dancer.id} className="flex flex-col items-center gap-2 text-center">
                {dancer.photoUrl ? (
                  <img src={dancer.photoUrl} alt="" className="w-16 h-16 rounded-2xl object-cover border border-gray-200" />
                ) : (
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white ${avatarColor(dancer)}`}>
                    {`${dancer.firstName[0] ?? ''}${dancer.lastName[0] ?? ''}`.toUpperCase()}
                  </div>
                )}
                <p className="text-xs font-medium text-gray-800 leading-tight">{dancer.firstName}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
