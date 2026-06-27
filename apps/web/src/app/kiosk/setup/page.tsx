'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

interface SessionOption {
  id: string;
  courseId: string;
  courseName: string;
  startTime: string;
  endTime: string;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ScanIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
    <path d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default function KioskSetupPage() {
  const { user, account, dancers, loading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAllowed =
    account?.roles?.includes('admin') ||
    dancers.some(d => d.roles.includes('admin') || d.roles.includes('instructor'));

  const myDancer = dancers.find(d => d.roles.includes('admin') || d.roles.includes('instructor'));
  const backHref = myDancer ? `/dancer/${myDancer.id}` : '/';

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (!isAllowed) { router.replace('/'); return; }

    const today = toDateStr(new Date());
    Promise.all([
      getDocs(query(collection(db, 'sessions'), where('date', '==', today), orderBy('startTime'))),
      getDocs(collection(db, 'courses')),
    ]).then(([sessSnap, coursesSnap]) => {
      const courseMap: Record<string, string> = {};
      coursesSnap.docs.forEach(d => { courseMap[d.id] = d.data().name as string; });
      setSessions(sessSnap.docs
        .filter(d => d.data().status === 'scheduled')
        .map(d => ({
          id: d.id,
          courseId: d.data().courseId as string,
          courseName: courseMap[d.data().courseId as string] ?? 'Cours inconnu',
          startTime: d.data().startTime as string,
          endTime: d.data().endTime as string,
        })));
    }).catch(() => setError('Erreur lors du chargement des séances')).finally(() => setLoadingSessions(false));
  }, [loading, user, isAllowed]);

  const handleOpen = async () => {
    if (!selectedSessionId || !user) return;
    const chosen = sessions.find(s => s.id === selectedSessionId);
    if (!chosen) return;
    setOpening(true);
    setError(null);
    try {
      const ref = await addDoc(collection(db, 'kioskSessions'), {
        sessionId: selectedSessionId,
        courseId: chosen.courseId,
        openedAt: serverTimestamp(),
        openedBy: myDancer?.id ?? user.uid,
        status: 'active',
        lastActivityAt: serverTimestamp(),
      });
      router.push(`/kiosk/${ref.id}/scan`);
    } catch {
      setError("Impossible d'ouvrir le kiosque");
      setOpening(false);
    }
  };

  if (loading || loadingSessions) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 shrink-0">
        <Link href={backHref} className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex items-center gap-2 text-amber-600">
          <ScanIcon />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 leading-tight">Kiosque de pointage</p>
          <p className="text-xs text-gray-400 capitalize">{today}</p>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">

          {/* Title */}
          <div className="text-center pb-2">
            <h1 className="text-xl font-bold text-gray-800">Sélectionne la séance</h1>
            <p className="text-sm text-gray-500 mt-1">Le kiosque restera ouvert jusqu'à fermeture manuelle</p>
          </div>

          {/* Sessions card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
            {sessions.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <ClockIcon />
                </div>
                <p className="text-sm font-medium text-gray-600">Aucune séance programmée aujourd'hui</p>
                <p className="text-xs text-gray-400 mt-1">Les séances sont créées depuis le planning</p>
              </div>
            ) : (
              sessions.map(s => {
                const selected = selectedSessionId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSessionId(s.id)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                      selected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-semibold text-sm ${selected ? 'text-primary' : 'text-gray-800'}`}>
                          {s.courseName}
                        </p>
                        <div className={`flex items-center gap-1 mt-0.5 text-xs ${selected ? 'text-primary/70' : 'text-gray-400'}`}>
                          <ClockIcon />
                          <span>{s.startTime} – {s.endTime}</span>
                        </div>
                      </div>
                      {selected && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white shrink-0">
                          <CheckIcon />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center bg-red-50 rounded-xl px-4 py-2.5 border border-red-100">
              {error}
            </p>
          )}

          <button
            onClick={handleOpen}
            disabled={!selectedSessionId || opening}
            className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {opening ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Ouverture…
              </span>
            ) : (
              'Ouvrir le kiosque'
            )}
          </button>

        </div>
      </main>
    </div>
  );
}
