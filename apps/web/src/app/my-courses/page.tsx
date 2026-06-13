'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, orderBy, doc, updateDoc, getDoc, arrayRemove, increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

interface Registration {
  id: string;
  courseId: string;
  seasonId: string;
  status: 'active' | 'waitlist' | 'cancelled';
  registeredAt: string;
}

interface CourseInfo {
  id: string;
  name: string;
  danceStyleId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roomName: string;
  styleName: string;
  styleColor: string;
  seasonLabel: string;
}

const DAY_LABELS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

export default function MyCoursesPage() {
  const { user, account } = useAuth();
  const [items, setItems] = useState<(Registration & { course: CourseInfo })[]>([]);
  const [levelsMap, setLevelsMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [unregistering, setUnregistering] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'levels'), orderBy('order'))).then(snap => {
      const map = new Map<string, string>();
      snap.docs.forEach(d => map.set(d.id, d.data().name));
      setLevelsMap(map);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const regsSnap = await getDocs(query(
        collection(db, 'registrations'),
        where('userId', '==', user.uid),
        where('status', 'in', ['active', 'waitlist']),
      ));

      const regs = regsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Registration));

      const enriched = await Promise.all(regs.map(async (reg) => {
        const courseSnap = await getDoc(doc(db, 'courses', reg.courseId));
        if (!courseSnap.exists()) return null;
        const c = courseSnap.data();

        const [styleSnap, roomSnap, seasonSnap] = await Promise.all([
          getDoc(doc(db, 'danceStyles', c.danceStyleId)),
          getDoc(doc(db, 'rooms', c.roomId)),
          getDoc(doc(db, 'seasons', reg.seasonId)),
        ]);

        const course: CourseInfo = {
          id: reg.courseId,
          name: c.name,
          danceStyleId: c.danceStyleId,
          dayOfWeek: c.dayOfWeek,
          startTime: c.startTime,
          endTime: c.endTime,
          roomName: roomSnap.exists() ? roomSnap.data().name : '',
          styleName: styleSnap.exists() ? styleSnap.data().name : '',
          styleColor: styleSnap.exists() ? (styleSnap.data().color ?? '#6B7280') : '#6B7280',
          seasonLabel: seasonSnap.exists() ? seasonSnap.data().label : '',
        };
        return { ...reg, course };
      }));

      setItems(enriched.filter(Boolean) as (Registration & { course: CourseInfo })[]);
      setLoading(false);
    };
    load();
  }, [user]);

  const handleUnregister = async (regId: string, courseId: string, status: string) => {
    if (!user) return;
    setUnregistering(regId);
    try {
      await updateDoc(doc(db, 'registrations', regId), { status: 'cancelled' });
      await updateDoc(doc(db, 'accounts', user.uid), {
        registeredCourseIds: arrayRemove(courseId),
      });
      if (status === 'active') {
        await updateDoc(doc(db, 'courses', courseId), {
          activeRegistrationCount: increment(-1),
        });
      }
      setItems(prev => prev.filter(i => i.id !== regId));
    } finally {
      setUnregistering(null);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link href="/profile" className="text-sm text-gray-400 hover:text-gray-700 mb-6 inline-block">← Profil</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Mes cours</h1>

        {items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400 mb-4">Vous n&apos;êtes inscrit à aucun cours.</p>
            <Link href="/planning" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Voir le planning →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="h-1.5" style={{ backgroundColor: item.course.styleColor }} />
                <div className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h2 className="font-semibold text-gray-900 text-sm">{item.course.name}</h2>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                        style={{ backgroundColor: item.course.styleColor }}
                      >
                        {item.course.styleName}
                      </span>
                      {(() => {
                        const raw = account?.levelsByStyle?.[item.course.danceStyleId];
                        const ids: string[] = Array.isArray(raw) ? raw : (raw ? [raw] : []);
                        return ids.map(id => levelsMap.get(id)).filter(Boolean).map((name, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                            {name}
                          </span>
                        ));
                      })()}
                      {item.status === 'waitlist' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                          Liste d&apos;attente
                        </span>
                      )}
                      {item.status === 'active' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                          Inscrit
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {DAY_LABELS[item.course.dayOfWeek]} {item.course.startTime}–{item.course.endTime}
                      {item.course.roomName && <span className="ml-2 text-gray-400">· {item.course.roomName}</span>}
                    </p>
                    {item.course.seasonLabel && (
                      <p className="text-xs text-gray-400 mt-0.5">{item.course.seasonLabel}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Link href={`/courses/${item.course.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">
                      Détails
                    </Link>
                    <button
                      onClick={() => handleUnregister(item.id, item.course.id, item.status)}
                      disabled={unregistering === item.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 whitespace-nowrap"
                    >
                      {unregistering === item.id ? 'En cours…' : 'Se désinscrire'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
