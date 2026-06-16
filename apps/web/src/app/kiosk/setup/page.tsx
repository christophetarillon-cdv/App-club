'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

interface Course { id: string; name: string; }
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
    }).catch((e) => setError('Erreur lors du chargement des séances')).finally(() => setLoadingSessions(false));
  }, [loading, user, isAllowed]);

  const handleOpen = async () => {
    if (!selectedSessionId || !user) return;
    const chosen = sessions.find(s => s.id === selectedSessionId);
    if (!chosen) return;
    setOpening(true);
    setError(null);
    try {
      const myDancer = dancers.find(d => d.roles.includes('admin') || d.roles.includes('instructor'));
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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-lg">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">📋</div>
          <h1 className="text-2xl font-bold text-white">Ouvrir le kiosque</h1>
          <p className="text-gray-400 mt-1 text-sm">Sélectionne la séance en cours</p>
        </div>

        <div className="bg-gray-800 rounded-2xl p-5 space-y-4">
          {sessions.length === 0 ? (
            <p className="text-gray-400 text-center py-4">Aucune séance programmée aujourd'hui.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSessionId(s.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                    selectedSessionId === s.id
                      ? 'border-blue-500 bg-blue-500/20'
                      : 'border-gray-700 bg-gray-700/50 hover:border-gray-500'
                  }`}
                >
                  <p className="font-semibold text-white">{s.courseName}</p>
                  <p className="text-sm text-gray-400">{s.startTime} – {s.endTime}</p>
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            onClick={handleOpen}
            disabled={!selectedSessionId || opening}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg"
          >
            {opening ? 'Ouverture…' : 'Ouvrir le kiosque'}
          </button>
        </div>

        <div className="text-center">
          <Link href="/profile" className="text-gray-500 hover:text-gray-300 text-sm">
            ← Retour au profil
          </Link>
        </div>
      </div>
    </div>
  );
}
