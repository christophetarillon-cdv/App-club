'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import type { Session, Course, Dancer } from '@cdv/types';

type AttendanceRow = {
  id: string;
  dancerId: string;
  method: 'qr' | 'manual' | 'manual-admin';
  status: 'registered' | 'walk-in';
  trialAlert?: 'sessions_exceeded' | 'expired' | null;
  scannedAt: { toDate: () => Date } | null;
  dancer: Pick<Dancer, 'firstName' | 'lastName' | 'memberNumber' | 'roles' | 'photoUrl'> | null;
};

type SearchableDancer = Pick<Dancer, 'firstName' | 'lastName' | 'memberNumber' | 'photoUrl'> & { id: string };

const addManualAttendanceFn = httpsCallable(functions, 'addManualAttendance');

const TRIAL_ALERT_LABEL: Record<'sessions_exceeded' | 'expired', string> = {
  sessions_exceeded: 'Essai dépassé (séances)',
  expired: 'Essai dépassé (période)',
};

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

function formatTime(ts: { toDate: () => Date } | null) {
  if (!ts) return '—';
  const d = ts.toDate();
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function SessionAttendancePage() {
  const { sid } = useParams<{ sid: string }>();
  const { account, dancers } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRow[]>([]);
  const [allDancers, setAllDancers] = useState<SearchableDancer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);

  const isAdmin = account?.roles?.includes('admin') || dancers.some(d => d.roles.includes('admin'));
  const isBureau = account?.roles?.includes('bureau') || dancers.some(d => d.roles.includes('bureau'));
  const canAddAttendance = isAdmin || isBureau;

  const load = async () => {
    const sessionSnap = await getDoc(doc(db, 'sessions', sid));
    if (!sessionSnap.exists()) { setLoading(false); return; }
    const sessionData = { id: sessionSnap.id, ...sessionSnap.data() } as Session;
    setSession(sessionData);

    const courseSnap = await getDoc(doc(db, 'courses', sessionData.courseId));
    if (courseSnap.exists()) setCourse({ id: courseSnap.id, ...courseSnap.data() } as Course);

    const attendanceSnap = await getDocs(query(
      collection(db, 'attendances'),
      where('sessionId', '==', sid),
    ));

    const presentDancerIds = new Set(attendanceSnap.docs.map(d => d.data().dancerId as string));
    const dancerIds = [...presentDancerIds];
    const dancerSnaps = await Promise.all(dancerIds.map(id => getDoc(doc(db, 'dancers', id))));
    const dancerMap = new Map(dancerSnaps.filter(s => s.exists()).map(s => [s.id, s.data() as Dancer]));

    const rows: AttendanceRow[] = attendanceSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        dancerId: data.dancerId,
        method: data.method,
        status: data.status ?? 'registered',
        trialAlert: data.trialAlert ?? null,
        scannedAt: data.scannedAt ?? null,
        dancer: dancerMap.get(data.dancerId) ?? null,
      };
    });

    rows.sort((a, b) => {
      const ta = a.scannedAt?.toDate().getTime() ?? 0;
      const tb = b.scannedAt?.toDate().getTime() ?? 0;
      return ta - tb;
    });

    setAttendances(rows);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  // Recherche libre par nom pour l'admin/bureau — chargée à part, en arrière
  // plan, pour ne pas ralentir l'affichage de la séance (tout le club peut
  // faire plusieurs centaines de danseurs) ; pas limité aux inscrits du
  // cours, ni au(x) danseur(s) d'un compte en particulier.
  const [dancersLoading, setDancersLoading] = useState(false);
  useEffect(() => {
    if (!canAddAttendance) return;
    setDancersLoading(true);
    getDocs(query(collection(db, 'dancers'), where('isActive', '==', true)))
      .then(allSnap => {
        setAllDancers(allSnap.docs.map(d => {
          const data = d.data() as Dancer;
          return { id: d.id, firstName: data.firstName, lastName: data.lastName, memberNumber: data.memberNumber, photoUrl: data.photoUrl };
        }));
      })
      .finally(() => setDancersLoading(false));
  }, [canAddAttendance]);

  const handleAddAttendance = async (dancerId: string) => {
    setAddingId(dancerId);
    try {
      const myDancer = dancers.find(d => d.roles.includes('admin') || d.roles.includes('bureau'));
      await addManualAttendanceFn({ sessionId: sid, dancerId, actingDancerId: myDancer?.id ?? null });
      setSearchQuery('');
      await load();
    } catch (err) {
      console.error('handleAddAttendance failed:', err);
    } finally {
      setAddingId(null);
    }
  };

  const presentIds = new Set(attendances.map(a => a.dancerId));
  const searchLower = searchQuery.trim().toLowerCase();
  const searchResults = searchLower.length < 2 ? [] : allDancers
    .filter(d => !presentIds.has(d.id) && `${d.firstName} ${d.lastName}`.toLowerCase().includes(searchLower))
    .slice(0, 8);

  if (loading) {
    return <p className="text-center text-gray-500 py-16">Chargement…</p>;
  }

  if (!session) {
    return <p className="text-center text-gray-500 py-16">Séance introuvable.</p>;
  }

  return (
    <div>
      {/* En-tête séance */}
      <div className="mb-6">
        <Link href="/instructor" className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Mes séances
        </Link>
        <h1 className="text-xl font-bold text-gray-800">{course?.name ?? '…'}</h1>
        <p className="text-gray-500 mt-0.5">
          {formatDate(session.date)} · {session.startTime}–{session.endTime}
        </p>
      </div>

      {/* Compteur */}
      <div className="bg-blue-600 text-white rounded-2xl px-5 py-4 mb-5 flex items-center justify-between">
        <span className="font-medium">Présents</span>
        <span className="text-3xl font-bold">{attendances.length}</span>
      </div>

      {/* Liste */}
      {attendances.length === 0 ? (
        <p className="text-center text-gray-400 py-12">Aucune présence enregistrée.</p>
      ) : (
        <div className="space-y-2">
          {attendances.map((a, i) => {
            const isTrial = a.dancer?.roles.includes('trial');
            return (
              <div key={a.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                <span className="text-sm font-mono text-gray-300 w-6 text-right">{i + 1}</span>
                {a.dancer?.photoUrl ? (
                  <img src={a.dancer.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
                    {a.dancer ? `${a.dancer.firstName[0]}${a.dancer.lastName[0]}` : '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">
                    {a.dancer ? `${a.dancer.firstName} ${a.dancer.lastName}` : a.dancerId}
                  </p>
                  {a.dancer?.memberNumber && (
                    <p className="text-xs text-gray-400 font-mono">{a.dancer.memberNumber}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className="text-xs text-gray-400">{formatTime(a.scannedAt)}</p>
                  <div className="flex gap-1">
                    {a.trialAlert ? (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                        ⚠️ {TRIAL_ALERT_LABEL[a.trialAlert]}
                      </span>
                    ) : isTrial && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Essai</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      a.method === 'qr' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {a.method === 'qr' ? 'QR' : a.method === 'manual-admin' ? 'Manuel (admin)' : 'Manuel'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ajouter une présence — admin/bureau seulement */}
      {canAddAttendance && (
        <div className="mt-8">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">
            Ajouter une présence
          </p>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher un danseur par nom…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-2">
              {searchResults.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                  {r.photoUrl ? (
                    <img src={r.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-xs shrink-0">
                      {r.firstName[0]}{r.lastName[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{r.firstName} {r.lastName}</p>
                    {r.memberNumber && <p className="text-xs text-gray-400 font-mono">{r.memberNumber}</p>}
                  </div>
                  <button
                    onClick={() => handleAddAttendance(r.id)}
                    disabled={addingId === r.id}
                    className="text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 disabled:opacity-50 shrink-0"
                  >
                    {addingId === r.id ? '…' : 'Marquer présent'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {searchLower.length >= 2 && dancersLoading && (
            <p className="text-xs text-gray-400 mt-2">Chargement des danseurs…</p>
          )}
          {searchLower.length >= 2 && !dancersLoading && searchResults.length === 0 && (
            <p className="text-xs text-gray-400 mt-2">Aucun danseur trouvé.</p>
          )}
        </div>
      )}
    </div>
  );
}
