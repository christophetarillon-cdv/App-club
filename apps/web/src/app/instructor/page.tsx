'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import type { Course, Session } from '@cdv/types';

type SessionWithCourse = Session & { courseName: string };

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

export default function InstructorPage() {
  const { account, dancers } = useAuth();
  const [sessions, setSessions] = useState<SessionWithCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = account?.roles?.includes('admin') || dancers.some(d => d.roles.includes('admin'));

  useEffect(() => {
    const load = async () => {
      const today = new Date();
      const from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const to = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const courses = new Map<string, string>();

      if (isAdmin) {
        // Admin : tous les cours
        const snap = await getDocs(collection(db, 'courses'));
        snap.docs.forEach(d => courses.set(d.id, (d.data() as Course).name));
      } else {
        // Moniteur : uniquement ses cours
        const myDancerIds = dancers
          .filter(d => d.roles.includes('instructor'))
          .map(d => d.id);
        if (myDancerIds.length === 0) { setLoading(false); return; }
        const courseSnaps = await Promise.all(
          myDancerIds.map(id =>
            getDocs(query(collection(db, 'courses'), where('instructorId', '==', id)))
          )
        );
        courseSnaps.forEach(snap =>
          snap.docs.forEach(d => courses.set(d.id, (d.data() as Course).name))
        );
      }

      if (courses.size === 0) { setLoading(false); return; }

      const courseIds = [...courses.keys()];
      // Firestore 'in' accepts up to 30 items
      const chunks: string[][] = [];
      for (let i = 0; i < courseIds.length; i += 30) chunks.push(courseIds.slice(i, i + 30));

      const allSessionDocs = (await Promise.all(
        chunks.map(ids =>
          getDocs(query(
            collection(db, 'sessions'),
            where('courseId', 'in', ids),
            where('date', '>=', from),
            where('date', '<=', to),
            orderBy('date', 'desc'),
          ))
        )
      )).flatMap(s => s.docs);

      const result: SessionWithCourse[] = allSessionDocs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<Session, 'id'>),
        courseName: courses.get(d.data().courseId) ?? '',
      }));

      result.sort((a, b) => b.date.localeCompare(a.date));
      setSessions(result);
      setLoading(false);
    };

    load().catch(() => setLoading(false));
  }, [dancers, isAdmin]);

  if (loading) {
    return <p className="text-center text-gray-500 py-16">Chargement…</p>;
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg">Aucune séance sur les 30 derniers jours</p>
        <p className="text-sm mt-1">Vérifiez que vous êtes bien assigné à un cours.</p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-4">
        Mes séances — 30 derniers jours
      </p>
      {sessions.map(s => {
        const isToday = s.date === today;
        const isPast = s.date < today;
        return (
          <Link
            key={s.id}
            href={`/instructor/sessions/${s.id}`}
            className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-200 px-5 py-4 hover:shadow-md transition-shadow"
          >
            <div>
              <p className="font-semibold text-gray-800">{s.courseName}</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {isToday ? <span className="text-blue-600 font-medium">Aujourd'hui</span> : formatDate(s.date)}
                {' · '}{s.startTime}–{s.endTime}
              </p>
              {s.status === 'cancelled' && (
                <span className="text-xs text-red-500 font-medium">Annulée</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {s.status !== 'cancelled' && (
                <div className={`text-right ${isPast ? 'text-gray-700' : 'text-blue-600'}`}>
                  <p className="text-xl font-bold">{s.actualAttendees ?? 0}</p>
                  <p className="text-xs text-gray-400">présents</p>
                </div>
              )}
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
