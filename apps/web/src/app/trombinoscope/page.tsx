'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Dancer } from '@cdv/types';

interface Course { id: string; name: string; danceStyleId: string; }
interface DanceStyle { id: string; name: string; color?: string; }
interface Season { id: string; label: string; isActive: boolean; }

export default function TrombinoscOpePage() {
  const { user } = useAuth();
  const router = useRouter();

  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [styles, setStyles] = useState<DanceStyle[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);

  // registeredDancerIds per courseId — built from registrations
  const [courseRegistrants, setCourseRegistrants] = useState<Map<string, Set<string>>>(new Map());

  const [filterCourse, setFilterCourse] = useState('');
  const [filterStyle, setFilterStyle] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;

    Promise.all([
      getDocs(query(collection(db, 'dancers'), where('isActive', '!=', false))),
      getDocs(collection(db, 'courses')),
      getDocs(collection(db, 'danceStyles')),
      getDocs(query(collection(db, 'seasons'), where('isActive', '==', true))),
    ]).then(async ([dancerSnap, courseSnap, styleSnap, seasonSnap]) => {
      setDancers(dancerSnap.docs.map(d => ({ id: d.id, ...d.data() } as Dancer))
        .sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr')));

      const cs = courseSnap.docs.map(d => ({
        id: d.id, name: d.data().name ?? '', danceStyleId: d.data().danceStyleId ?? '',
      })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      setCourses(cs);

      setStyles(styleSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '', color: d.data().color })));

      const season = seasonSnap.docs[0] ? { id: seasonSnap.docs[0].id, ...seasonSnap.docs[0].data() } as Season : null;
      setActiveSeason(season);

      // Fetch registrations for active season to build courseId → accountIds map
      if (season) {
        const regSnap = await getDocs(query(
          collection(db, 'registrations'),
          where('seasonId', '==', season.id),
          where('status', 'in', ['active', 'waitlist']),
        ));
        const map = new Map<string, Set<string>>();
        regSnap.docs.forEach(d => {
          const cId = d.data().courseId as string;
          const uId = d.data().userId as string;
          if (!map.has(cId)) map.set(cId, new Set());
          map.get(cId)!.add(uId);
        });
        setCourseRegistrants(map);
      }
    }).finally(() => setLoading(false));
  }, [user]);

  // accountId → dancer lookup for course filter
  const dancerByAccountId = new Map(dancers.map(d => [d.accountId, d]));

  const filtered = dancers.filter(dancer => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!dancer.firstName.toLowerCase().includes(q)) return false;
    }
    if (filterCourse) {
      const registrants = courseRegistrants.get(filterCourse);
      if (!registrants) return false;
      if (!dancer.accountId || !registrants.has(dancer.accountId)) return false;
    }
    if (filterStyle) {
      const hasStyle = dancer.levelsByStyle && Object.keys(dancer.levelsByStyle).includes(filterStyle);
      if (!hasStyle) return false;
    }
    return true;
  });

  const initials = (d: Dancer) => `${d.firstName[0] ?? ''}`.toUpperCase();

  const avatarColor = (d: Dancer) => {
    const colors = ['bg-blue-200 text-blue-800', 'bg-purple-200 text-purple-800', 'bg-green-200 text-green-800',
      'bg-orange-200 text-orange-800', 'bg-pink-200 text-pink-800', 'bg-teal-200 text-teal-800'];
    const idx = (d.firstName.charCodeAt(0) ?? 0) % colors.length;
    return colors[idx];
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-gray-700 font-semibold mb-3">Connectez-vous pour voir le trombinoscope.</p>
          <Link href="/login" className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-700">← Retour</button>
          <h1 className="text-2xl font-bold text-gray-900">Trombinoscope</h1>
          {!loading && <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">{filtered.length}</span>}
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-3 mb-6">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un prénom…"
            className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            <option value="">Tous les cours</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterStyle} onChange={e => setFilterStyle(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            <option value="">Tous les styles</option>
            {styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-500 font-medium">Aucun danseur trouvé.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
            {filtered.map(dancer => (
              <div key={dancer.id} className="flex flex-col items-center gap-2 text-center">
                {dancer.photoUrl ? (
                  <img
                    src={dancer.photoUrl}
                    alt=""
                    className="w-16 h-16 rounded-full object-cover shadow-sm"
                  />
                ) : (
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shadow-sm ${avatarColor(dancer)}`}>
                    {initials(dancer)}
                  </div>
                )}
                <p className="text-sm font-medium text-gray-800 leading-tight">{dancer.firstName}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
