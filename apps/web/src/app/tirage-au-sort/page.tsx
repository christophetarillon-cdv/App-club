'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { RaffleEntry } from '@cdv/types';

type Status = 'loading' | 'empty' | 'spinning' | 'winner';

const PAGE_KEY = '/tirage-au-sort';

export default function TirageAuSortPage() {
  const router = useRouter();
  const { user, account, dancers, loading: authLoading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const userRoles: string[] = [
    ...(account?.roles ?? []),
    ...dancers.flatMap(d => d.roles),
  ];
  const isAdmin = userRoles.includes('admin');

  // Vérifie l'accès indépendamment de tout layout admin : cette page doit
  // pouvoir s'ouvrir seule (projection lors de l'événement), sans le cadre
  // de navigation habituel.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (isAdmin) { setAllowed(true); return; }
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      const perms = (snap.data()?.pagePermissions ?? {}) as Record<string, string[]>;
      const roles = perms[PAGE_KEY] ?? ['admin'];
      setAllowed(userRoles.some(r => roles.includes(r)));
    });
  }, [authLoading, user, isAdmin, router]);

  const [status, setStatus] = useState<Status>('loading');
  const [pool, setPool] = useState<RaffleEntry[]>([]);
  const [winner, setWinner] = useState<RaffleEntry | null>(null);
  const [cursor, setCursor] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPool = async () => {
    setStatus('loading');
    setWinner(null);
    const snap = await getDocs(query(collection(db, 'raffleEntries'), where('hasWon', '==', false)));
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() } as RaffleEntry));
    setPool(entries);
    if (entries.length === 0) { setStatus('empty'); return; }
    setStatus('spinning');
  };

  useEffect(() => { if (allowed) loadPool(); }, [allowed]);

  // Fait défiler rapidement un nom au hasard pendant le tirage
  useEffect(() => {
    if (status !== 'spinning' || pool.length === 0) return;
    intervalRef.current = setInterval(() => {
      setCursor(c => (c + 1) % pool.length);
    }, 90);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [status, pool.length]);

  const handleStop = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) return;
    setWinner(picked);
    setStatus('winner');
    await updateDoc(doc(db, 'raffleEntries', picked.id), { hasWon: true, wonAt: serverTimestamp() });
  };

  if (authLoading || allowed === null) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>;
  }

  if (!allowed) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Accès non autorisé.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <h1 className="text-xl font-semibold text-gray-800 mb-1 text-center">Tirage au sort</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">Gagne une saison gratuite — passez cette page en plein écran pour la projeter.</p>

        <div
          className="relative overflow-hidden rounded-2xl flex flex-col items-center justify-center py-16 px-8 text-center"
          style={{ background: 'linear-gradient(180deg, #12405C 0%, #1B5A82 45%, #2F86C0 100%)' }}
        >
          {status === 'loading' && (
            <p className="text-white/70 text-sm">Chargement des participants…</p>
          )}

          {status === 'empty' && (
            <p className="text-white/80 text-sm">Aucun participant en attente de tirage pour le moment.</p>
          )}

          {status === 'spinning' && pool.length > 0 && (
            <>
              <div className="text-white/50 text-xs font-semibold tracking-[0.3em] uppercase mb-4">
                Tirage au sort en cours…
              </div>
              <div className="relative w-full max-w-xl h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden mb-10">
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-56 border-l-2 border-r-2 border-orange bg-orange/10" />
                <span className="relative text-2xl font-bold text-white">
                  {pool[cursor]?.prenom} {pool[cursor]?.nom?.[0]}.
                </span>
              </div>
              <button
                onClick={handleStop}
                className="rounded-full px-12 py-5 text-lg font-extrabold tracking-wide text-white bg-orange hover:bg-orangeDark transition-colors shadow-lg"
              >
                ARRÊTER
              </button>
            </>
          )}

          {status === 'winner' && winner && (
            <>
              <div className="text-orangeDark bg-white text-xs font-bold tracking-[0.25em] uppercase mb-4 px-4 py-1.5 rounded-full">
                Le gagnant est
              </div>
              <div className="text-4xl font-extrabold text-white leading-tight">{winner.prenom}</div>
              <div className="text-2xl font-bold text-white/85 tracking-wide mt-1">{winner.nom.toUpperCase()}</div>
              <button
                onClick={loadPool}
                className="mt-10 text-sm font-medium text-white/70 hover:text-white underline underline-offset-2"
              >
                Relancer un tirage
              </button>
            </>
          )}
        </div>

        {status !== 'loading' && (
          <p className="text-xs text-gray-400 mt-3 text-center">{pool.length} participant{pool.length > 1 ? 's' : ''} en lice.</p>
        )}
      </div>
    </div>
  );
}
