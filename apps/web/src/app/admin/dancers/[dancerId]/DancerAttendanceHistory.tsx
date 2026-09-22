'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const PAGE_SIZE = 25;

const METHOD_LABEL: Record<string, string> = { qr: 'QR code', manual: 'Manuel', 'manual-admin': 'Manuel (admin)' };
const METHOD_COLOR: Record<string, string> = {
  qr: 'bg-emerald-100 text-emerald-700',
  manual: 'bg-blue-100 text-blue-700',
  'manual-admin': 'bg-purple-100 text-purple-700',
};

interface SeasonOpt { id: string; label: string; from: string; to: string; isActive: boolean; }
interface Row { id: string; date: string; time: string; courseId: string; courseLabel: string; method: string; }

function tsToDate(ts: any): string {
  if (!ts) return '';
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString().slice(0, 10);
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000).toISOString().slice(0, 10);
  return String(ts).slice(0, 10);
}

function formatRowDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Une saison peut compter jusqu'à ~300 séances pour un seul danseur assidu —
// tout tient dans une seule requête Firestore (bornée par les dates de la
// saison, pas "tout l'historique"), la pagination n'est que côté affichage.
export default function DancerAttendanceHistory({ dancerId }: { dancerId: string }) {
  const [seasons, setSeasons] = useState<SeasonOpt[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [courseOptions, setCourseOptions] = useState<{ id: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    getDocs(collection(db, 'seasons')).then(snap => {
      const list: SeasonOpt[] = snap.docs
        .map(d => ({
          id: d.id,
          label: d.data().label ?? d.id,
          from: tsToDate(d.data().startDate),
          to: tsToDate(d.data().endDate),
          isActive: d.data().isActive === true,
        }))
        .sort((a, b) => b.from.localeCompare(a.from));
      setSeasons(list);
      const active = list.find(s => s.isActive) ?? list[0];
      if (active) setSeasonId(active.id);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const season = seasons.find(s => s.id === seasonId);
    if (!season) return;
    setLoading(true);
    setLoadError(null);
    setPage(0);
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const to = season.to && season.to < today ? season.to : today;

        const attSnap = await getDocs(query(
          collection(db, 'attendances'),
          where('dancerId', '==', dancerId),
          where('date', '>=', season.from || '0000-00-00'),
          where('date', '<=', to),
          orderBy('date', 'desc'),
        ));
        const attendances = attSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        const sessionIds = [...new Set(attendances.map(a => a.sessionId).filter(Boolean))] as string[];
        const chunks: string[][] = [];
        for (let i = 0; i < sessionIds.length; i += 30) chunks.push(sessionIds.slice(i, i + 30));
        const sessionSnaps = await Promise.all(chunks.map(c =>
          getDocs(query(collection(db, 'sessions'), where('__name__', 'in', c))),
        ));
        const sessionById = new Map<string, any>();
        sessionSnaps.flatMap(s => s.docs).forEach(d => sessionById.set(d.id, d.data()));

        const courseIds = [...new Set([...sessionById.values()].map(s => s.courseId).filter(Boolean))] as string[];
        const courseSnaps = await Promise.all(courseIds.map(id => getDoc(doc(db, 'courses', id))));
        const courseById = new Map<string, any>();
        courseSnaps.forEach(s => { if (s.exists()) courseById.set(s.id, s.data()); });

        const levelIds = [...new Set([...courseById.values()].map(c => c.levelId).filter(Boolean))] as string[];
        const levelSnaps = await Promise.all(levelIds.map(id => getDoc(doc(db, 'levels', id))));
        const levelNameById = new Map<string, string>();
        levelSnaps.forEach(s => { if (s.exists()) levelNameById.set(s.id, s.data()!.name ?? ''); });

        const courseLabel = (courseId?: string): string => {
          if (!courseId) return '—';
          const c = courseById.get(courseId);
          if (!c) return '—';
          const lvl = c.levelId ? levelNameById.get(c.levelId) : undefined;
          return lvl ? `${c.name} · ${lvl}` : (c.name ?? '—');
        };

        const rowsBuilt: Row[] = attendances.map(a => {
          const session = a.sessionId ? sessionById.get(a.sessionId) : undefined;
          const courseId = session?.courseId ?? '';
          return {
            id: a.id,
            date: a.date ?? '',
            time: session ? `${session.startTime ?? ''}–${session.endTime ?? ''}` : '',
            courseId,
            courseLabel: session ? courseLabel(courseId) : '—',
            method: a.method ?? '',
          };
        });

        setCourseOptions(
          [...courseById.keys()]
            .map(id => ({ id, label: courseLabel(id) }))
            .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
        );
        setRows(rowsBuilt);
      } catch (err) {
        console.error('[DancerAttendanceHistory] load failed:', err);
        setLoadError('Erreur lors du chargement des présences.');
      } finally {
        setLoading(false);
      }
    })();
  }, [seasonId, dancerId, seasons]);

  const filtered = useMemo(
    () => courseFilter === 'all' ? rows : rows.filter(r => r.courseId === courseFilter),
    [rows, courseFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paginated = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-gray-900">Participations aux séances</h2>
        <div className="flex items-center gap-2">
          <select
            value={seasonId}
            onChange={e => setSeasonId(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select
            value={courseFilter}
            onChange={e => { setCourseFilter(e.target.value); setPage(0); }}
            className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="all">Tous les cours</option>
            {courseOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {loadError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{loadError}</p>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Chargement…</div>
      ) : seasons.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">
          Aucune saison configurée.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
            {filtered.length} présence{filtered.length !== 1 ? 's' : ''} sur la saison sélectionnée
          </div>
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cours</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Horaire</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Méthode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{formatRowDate(row.date)}</td>
                    <td className="px-4 py-2 text-gray-700">{row.courseLabel}</td>
                    <td className="px-4 py-2 text-gray-500 hidden sm:table-cell whitespace-nowrap">{row.time}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLOR[row.method] ?? 'bg-gray-100 text-gray-500'}`}>
                        {METHOD_LABEL[row.method] ?? row.method}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                      Aucune présence sur cette saison.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 text-sm">
              <p className="text-gray-500">
                {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} sur {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="px-3 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-40"
                >
                  ←
                </button>
                <span className="text-gray-500">Page {currentPage + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                  className="px-3 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-40"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
