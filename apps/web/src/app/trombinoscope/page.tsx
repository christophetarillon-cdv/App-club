'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { AppShell } from '@/components/AppShell';
import type { Dancer } from '@cdv/types';

export default function TrombinoscOpePage() {
  const { user, account, dancers: myDancers } = useAuth();
  const { selectedDancer } = useDancer();
  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);

  const isAdmin =
    (account?.roles?.includes('admin') ?? false) ||
    myDancers.some(d => d.roles.includes('admin'));

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getDocs(query(collection(db, 'dancers'), where('isActive', '!=', false))),
      getDocs(query(collection(db, 'seasons'), orderBy('startDate', 'desc'))),
    ]).then(([dancerSnap, seasonSnap]) => {
      const allDancers = dancerSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Dancer))
        .sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr'));

      if (!seasonSnap.empty) {
        const allSeasons = seasonSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; isActive?: boolean; registrationOpen?: boolean }));
        const season =
          allSeasons.find(s => s.isActive) ??
          allSeasons.find(s => s.registrationOpen) ??
          allSeasons[0]!;

        const currentDancer = allDancers.find(d => d.id === selectedDancer?.id);
        const hasAccess = isAdmin || (currentDancer?.validatedSeasonIds?.includes(season.id) ?? false);
        if (!hasAccess) { setAccessDenied(true); return; }

        setDancers(allDancers.filter(d => d.validatedSeasonIds?.includes(season.id)));
      } else {
        setDancers(allDancers);
      }
    }).finally(() => setLoading(false));
  }, [user, selectedDancer?.id, isAdmin]);

  const filtered = search.trim()
    ? dancers.filter(d => d.firstName.toLowerCase().includes(search.toLowerCase()) ||
                          d.lastName.toLowerCase().includes(search.toLowerCase()))
    : dancers;

  const palette = ['bg-blue-400','bg-purple-400','bg-pink-400','bg-green-500','bg-orange-400','bg-teal-500','bg-red-400','bg-indigo-400'];
  const avatarColor = (d: Dancer) => palette[(d.firstName.charCodeAt(0) ?? 0) % palette.length];

  return (
    <AppShell>
      <div className="relative overflow-hidden pb-8" style={{
        background: 'linear-gradient(180deg, #2F86C0 0%, #2F86C0 45%, #7FBFE3 70%, #D8EAF3 88%, #F9F7F4 100%)',
      }}>
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <h1 className="text-2xl font-extrabold text-white">Trombinoscope</h1>
        </div>
        <svg className="absolute bottom-0 left-0 w-full h-8 text-background" viewBox="0 0 400 44" preserveAspectRatio="none" fill="currentColor">
          <path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" />
        </svg>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-5 -mt-4 relative">

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
        ) : accessDenied ? (
          <div className="bg-white rounded-2xl border border-gray-200 px-6 py-16 text-center">
            <p className="text-gray-800 font-semibold mb-1">Accès réservé</p>
            <p className="text-gray-400 text-sm">Votre cotisation doit être validée pour accéder au trombinoscope.</p>
          </div>
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
