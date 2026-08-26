'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { RaffleEntry } from '@cdv/types';

type Status = 'loading' | 'empty' | 'spinning' | 'winner';

const PAGE_KEY = '/admin/tirage-au-sort';
const CHIP_COUNT = 14; // répété x2 pour la boucle continue
// Sans caractères ambigus (0/O, 1/I/L) : le code peut être annoncé à l'oral.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateWinnerCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

function TicketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4V8z"
        stroke="#fff" strokeWidth="1.6" strokeLinejoin="round"
      />
      <path d="M14 6v12" stroke="#fff" strokeWidth="1.6" strokeDasharray="2 2" />
    </svg>
  );
}

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
  // de navigation habituel. Même clé de permission que /admin/tirage-au-sort
  // (la page de gestion des inscrits), pour une seule ligne à gérer dans
  // "Accès pages".
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

  const handleStop = async () => {
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) return;
    const code = generateWinnerCode();
    setStatus('winner');
    setWinner({ ...picked, winnerCode: code });
    await setDoc(doc(db, 'raffleWinnerCodes', code), {
      raffleEntryId: picked.id,
      redeemed: false,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'raffleEntries', picked.id), { hasWon: true, wonAt: serverTimestamp(), winnerCode: code });
  };

  if (authLoading || allowed === null) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>;
  }

  if (!allowed) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Accès non autorisé.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <style>{`
        @keyframes tirageMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes tirageStopGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45), 0 8px 20px rgba(0,0,0,0.35); }
          50% { box-shadow: 0 0 0 14px rgba(239,68,68,0), 0 8px 20px rgba(0,0,0,0.35); }
        }
        .tirage-track { animation: tirageMarquee 4s linear infinite; }
        .tirage-stop-btn { animation: tirageStopGlow 1.8s ease-out infinite; }
      `}</style>

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
              <div className="text-white/50 text-xs font-semibold tracking-[0.3em] uppercase mb-6">
                Tirage au sort en cours…
              </div>

              <div className="relative w-full max-w-xl h-24 rounded-2xl bg-white/5 border border-white/10 overflow-hidden mb-10 flex items-center">
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-24 border-l-2 border-r-2 border-orange bg-orange/10 z-20" />
                <div className="absolute inset-y-0 left-0 w-16 z-10" style={{ background: 'linear-gradient(90deg, #12405C 0%, transparent 100%)' }} />
                <div className="absolute inset-y-0 right-0 w-16 z-10" style={{ background: 'linear-gradient(270deg, #12405C 0%, transparent 100%)' }} />

                <div className="tirage-track flex items-center gap-4" style={{ width: 'max-content' }}>
                  {Array.from({ length: CHIP_COUNT * 2 }).map((_, i) => (
                    <div key={i} className="flex-none w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
                      <TicketIcon />
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleStop}
                className="tirage-stop-btn rounded-full px-12 py-5 text-lg font-extrabold tracking-wide text-white bg-orange hover:bg-orangeDark transition-colors"
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

              <p className="text-xs text-white/50 mt-6 max-w-xs">
                Le code de sa saison gratuite est disponible dans la page de gestion (admin).
              </p>

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
