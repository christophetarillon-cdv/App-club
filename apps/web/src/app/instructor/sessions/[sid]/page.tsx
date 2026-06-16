'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import type { Session, Course, Dancer } from '@cdv/types';

type AttendanceRow = {
  id: string;
  dancerId: string;
  method: 'qr' | 'manual';
  status: 'registered' | 'walk-in';
  scannedAt: { toDate: () => Date } | null;
  dancer: Pick<Dancer, 'firstName' | 'lastName' | 'memberNumber' | 'roles'> | null;
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
  const [session, setSession] = useState<Session | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

      if (attendanceSnap.empty) { setLoading(false); return; }

      const dancerIds = [...new Set(attendanceSnap.docs.map(d => d.data().dancerId as string))];
      const dancerSnaps = await Promise.all(dancerIds.map(id => getDoc(doc(db, 'dancers', id))));
      const dancerMap = new Map(dancerSnaps.filter(s => s.exists()).map(s => [s.id, s.data() as Dancer]));

      const rows: AttendanceRow[] = attendanceSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          dancerId: data.dancerId,
          method: data.method,
          status: data.status ?? 'registered',
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

    load().catch(() => setLoading(false));
  }, [sid]);

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
            const isWalkIn = a.status === 'walk-in';
            return (
              <div key={a.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                <span className="text-sm font-mono text-gray-300 w-6 text-right">{i + 1}</span>
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
                    {isTrial && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Essai</span>
                    )}
                    {isWalkIn && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Visiteur</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      a.method === 'qr' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {a.method === 'qr' ? 'QR' : 'Manuel'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
