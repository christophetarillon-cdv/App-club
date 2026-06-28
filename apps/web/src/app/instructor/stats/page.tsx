'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

type RawSession    = { id: string; courseId: string; date: string; startTime: string; endTime: string; status: string };
type RawAttendance = { id: string; sessionId: string; dancerId: string; method: 'qr' | 'manual'; status: string };
type RawDancer     = { id: string; roles: string[] };
type RawCourse     = { id: string; name: string };

type WeekStat = { label: string; total: number; unique: number };
type CourseStat = { id: string; name: string; avg: number; sessions: number };
type CourseWeek = { courseId: string; courseName: string; weeks: Map<string, number> };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMondayKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

function weekLabel(key: string): string {
  const d = new Date(key + 'T12:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function fromDateForPeriod(period: string): string {
  const d = new Date();
  if (period === '4w')  d.setDate(d.getDate() - 28);
  if (period === '8w')  d.setDate(d.getDate() - 56);
  if (period === '12w') d.setDate(d.getDate() - 84);
  if (period === '6m')  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

async function batchAttendances(sessionIds: string[]): Promise<RawAttendance[]> {
  if (!sessionIds.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < sessionIds.length; i += 30) chunks.push(sessionIds.slice(i, i + 30));
  const snaps = await Promise.all(chunks.map(c =>
    getDocs(query(collection(db, 'attendances'), where('sessionId', 'in', c)))
  ));
  return snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() } as RawAttendance)));
}

async function batchDancers(ids: string[]): Promise<Map<string, RawDancer>> {
  if (!ids.length) return new Map();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  const snaps = await Promise.all(chunks.map(c =>
    getDocs(query(collection(db, 'dancers'), where('__name__', 'in', c)))
  ));
  const map = new Map<string, RawDancer>();
  snaps.flatMap(s => s.docs).forEach(d => map.set(d.id, { id: d.id, ...d.data() } as RawDancer));
  return map;
}

const COLORS = ['#378ADD','#534AB7','#1D9E75','#EF9F27','#D4537E','#E24B4A','#0F6E56','#854F0B'];
const COURSE_DASHES: number[][] = [[],[4,3],[2,2],[6,2],[3,5],[]];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [period, setPeriod]   = useState('12w');
  const [courseFilter, setCourseFilter] = useState('all');
  const [courses, setCourses] = useState<RawCourse[]>([]);
  const [tab, setTab]         = useState<'both' | 'total' | 'unique'>('both');
  const [loading, setLoading] = useState(true);

  // Computed stats
  const [weekStats,   setWeekStats]   = useState<WeekStat[]>([]);
  const [courseStats, setCourseStats] = useState<CourseStat[]>([]);
  const [courseWeeks, setCourseWeeks] = useState<CourseWeek[]>([]);
  const [statusBreak, setStatusBreak] = useState({ members: 0, trial: 0, walkIn: 0 });
  const [assiduity,   setAssiduity]   = useState<{ label: string; count: number }[]>([]);

  // Metric cards
  const [metrics, setMetrics] = useState({ thisWeek: 0, uniqueThisWeek: 0, returnRate: 0, avgPerSession: 0 });

  // Chart refs
  const c1Ref = useRef<HTMLCanvasElement>(null);
  const c2Ref = useRef<HTMLCanvasElement>(null);
  const c3Ref = useRef<HTMLCanvasElement>(null);
  const c4Ref = useRef<HTMLCanvasElement>(null);
  const c5Ref = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Record<string, any>>({});

  // ── Data load ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const from  = fromDateForPeriod(period);

      // 1. Load all courses
      const courseSnap = await getDocs(collection(db, 'courses'));
      const courseMap  = new Map<string, string>();
      const allCourses: RawCourse[] = [];
      courseSnap.docs.forEach(d => {
        courseMap.set(d.id, (d.data() as any).name ?? d.id);
        allCourses.push({ id: d.id, name: (d.data() as any).name ?? d.id });
      });
      allCourses.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      setCourses(allCourses);

      // 2. Load sessions in date range
      let sessQ = query(
        collection(db, 'sessions'),
        where('date', '>=', from),
        where('date', '<=', today),
        orderBy('date'),
      );
      const sessSnap = await getDocs(sessQ);
      let sessions: RawSession[] = sessSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as RawSession))
        .filter(s => s.status !== 'cancelled');

      if (courseFilter !== 'all') {
        sessions = sessions.filter(s => s.courseId === courseFilter);
      }

      if (!sessions.length) {
        setWeekStats([]); setCourseStats([]); setCourseWeeks([]);
        setStatusBreak({ members: 0, trial: 0, walkIn: 0 }); setAssiduity([]);
        setMetrics({ thisWeek: 0, uniqueThisWeek: 0, returnRate: 0, avgPerSession: 0 });
        setLoading(false); return;
      }

      // 3. Load attendances
      const sessionIds   = sessions.map(s => s.id);
      const attendances  = await batchAttendances(sessionIds);

      // 4. Load dancers for status breakdown
      const dancerIds  = [...new Set(attendances.map(a => a.dancerId))];
      const dancerMap  = await batchDancers(dancerIds);

      // ── Aggregate by week ───────────────────────────────────────────────────
      const attBySession = new Map<string, RawAttendance[]>();
      attendances.forEach(a => {
        if (!attBySession.has(a.sessionId)) attBySession.set(a.sessionId, []);
        attBySession.get(a.sessionId)!.push(a);
      });

      const weekMap = new Map<string, { total: number; dancerIds: Set<string> }>();
      sessions.forEach(s => {
        const wk  = getMondayKey(s.date);
        if (!weekMap.has(wk)) weekMap.set(wk, { total: 0, dancerIds: new Set() });
        const entry = weekMap.get(wk)!;
        (attBySession.get(s.id) ?? []).forEach(a => {
          entry.total++;
          entry.dancerIds.add(a.dancerId);
        });
      });
      const sortedWeeks = [...weekMap.keys()].sort();
      const weekStatsArr: WeekStat[] = sortedWeeks.map(wk => ({
        label: weekLabel(wk),
        total: weekMap.get(wk)!.total,
        unique: weekMap.get(wk)!.dancerIds.size,
      }));
      setWeekStats(weekStatsArr);

      // ── Metrics ─────────────────────────────────────────────────────────────
      const currentWeekKey = getMondayKey(today);
      const prevWeekKey    = getMondayKey(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
      const thisWk = weekMap.get(currentWeekKey) ?? { total: 0, dancerIds: new Set<string>() };
      const prevWk = weekMap.get(prevWeekKey)    ?? { total: 0, dancerIds: new Set<string>() };
      const returnCount = prevWk.dancerIds.size > 0
        ? [...thisWk.dancerIds].filter(id => prevWk.dancerIds.has(id)).length
        : 0;
      const returnRate = prevWk.dancerIds.size > 0
        ? Math.round((returnCount / prevWk.dancerIds.size) * 100)
        : 0;
      const avgPerSession = sessions.length > 0
        ? Math.round((attendances.length / sessions.length) * 10) / 10
        : 0;
      setMetrics({
        thisWeek: thisWk.total,
        uniqueThisWeek: thisWk.dancerIds.size,
        returnRate,
        avgPerSession,
      });

      // ── Per-course averages ─────────────────────────────────────────────────
      const courseAgg = new Map<string, { sessions: number; total: number }>();
      sessions.forEach(s => {
        if (!courseAgg.has(s.courseId)) courseAgg.set(s.courseId, { sessions: 0, total: 0 });
        const e = courseAgg.get(s.courseId)!;
        e.sessions++;
        e.total += (attBySession.get(s.id) ?? []).length;
      });
      const courseStatsArr: CourseStat[] = [...courseAgg.entries()]
        .map(([id, v]) => ({ id, name: courseMap.get(id) ?? id, avg: v.sessions ? Math.round((v.total / v.sessions) * 10) / 10 : 0, sessions: v.sessions }))
        .sort((a, b) => b.avg - a.avg);
      setCourseStats(courseStatsArr);

      // ── Per-course per-week ─────────────────────────────────────────────────
      const cwMap = new Map<string, Map<string, number>>();
      sessions.forEach(s => {
        const wk = getMondayKey(s.date);
        if (!cwMap.has(s.courseId)) cwMap.set(s.courseId, new Map());
        const m = cwMap.get(s.courseId)!;
        m.set(wk, (m.get(wk) ?? 0) + (attBySession.get(s.id) ?? []).length);
      });
      const courseWeeksArr: CourseWeek[] = [...cwMap.entries()].map(([courseId, weekCounts]) => ({
        courseId,
        courseName: courseMap.get(courseId) ?? courseId,
        weeks: weekCounts,
      }));
      setCourseWeeks(courseWeeksArr);

      // ── Status breakdown ────────────────────────────────────────────────────
      let members = 0, trial = 0, walkIn = 0;
      attendances.forEach(a => {
        if (a.status === 'walk-in') { walkIn++; return; }
        const d = dancerMap.get(a.dancerId);
        if (d?.roles?.includes('trial')) trial++;
        else members++;
      });
      setStatusBreak({ members, trial, walkIn });

      // ── Assiduity histogram ─────────────────────────────────────────────────
      const dancerCount = new Map<string, number>();
      attendances.forEach(a => dancerCount.set(a.dancerId, (dancerCount.get(a.dancerId) ?? 0) + 1));
      const histogram = new Map<number, number>();
      [...dancerCount.values()].forEach(n => histogram.set(n, (histogram.get(n) ?? 0) + 1));
      const maxSessions = Math.max(...histogram.keys(), 0);
      const assiduityArr = Array.from({ length: maxSessions }, (_, i) => ({
        label: String(i + 1),
        count: histogram.get(i + 1) ?? 0,
      }));
      setAssiduity(assiduityArr);

    } finally {
      setLoading(false);
    }
  }, [period, courseFilter]);

  useEffect(() => { load(); }, [load]);

  // ── Chart rendering ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (loading || !weekStats.length) return;
    let cancelled = false;

    (async () => {
      const { Chart, registerables } = await import('chart.js');
      if (cancelled) return;
      Chart.register(...registerables);

      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const gridColor  = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
      const tickColor  = isDark ? '#888' : '#999';
      const baseScales = {
        x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, beginAtZero: true },
      };

      Object.values(charts.current).forEach((c: any) => { try { c.destroy(); } catch {} });
      charts.current = {};

      // C1 — évolution S/S
      if (c1Ref.current) {
        const ds1 = { label: 'Présences totales', data: weekStats.map(w => w.total),
          borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,.1)',
          borderWidth: 2, pointRadius: 3, tension: 0.35, fill: true,
          hidden: tab === 'unique' };
        const ds2 = { label: 'Danseurs uniques', data: weekStats.map(w => w.unique),
          borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,.08)',
          borderWidth: 2, borderDash: [5, 3], pointRadius: 3, tension: 0.35, fill: false,
          hidden: tab === 'total' };
        charts.current.c1 = new Chart(c1Ref.current, {
          type: 'line',
          data: { labels: weekStats.map(w => w.label), datasets: [ds1, ds2] },
          options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: baseScales },
        });
      }

      // C2 — moyenne par cours (barre horizontale)
      if (c2Ref.current && courseStats.length) {
        const barHeight = Math.max(180, courseStats.length * 42);
        (c2Ref.current.parentElement as HTMLElement).style.height = barHeight + 'px';
        charts.current.c2 = new Chart(c2Ref.current, {
          type: 'bar',
          data: {
            labels: courseStats.map(c => c.name.length > 22 ? c.name.slice(0, 20) + '…' : c.name),
            datasets: [{ data: courseStats.map(c => c.avg),
              backgroundColor: courseStats.map((_, i) => COLORS[i % COLORS.length]),
              borderRadius: 4, borderSkipped: false }],
          },
          options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false },
              tooltip: { callbacks: { label: (v: any) => `${v.raw} présents en moy. (${courseStats[v.dataIndex]?.sessions} séances)` } } },
            scales: { x: { ...baseScales.x, max: Math.ceil(Math.max(...courseStats.map(c => c.avg)) * 1.2) || 20 },
              y: { grid: { display: false }, ticks: { color: tickColor, font: { size: 11 } } } } },
        });
      }

      // C3 — donut statut
      if (c3Ref.current) {
        const { members, trial, walkIn } = statusBreak;
        const total = members + trial + walkIn;
        charts.current.c3 = new Chart(c3Ref.current, {
          type: 'doughnut',
          data: {
            labels: ['Membres', "Cours d'essai", 'Visiteurs'],
            datasets: [{ data: [members, trial, walkIn],
              backgroundColor: ['#378ADD', '#EF9F27', '#1D9E75'],
              borderWidth: 0, hoverOffset: 4 }],
          },
          options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false },
              tooltip: { callbacks: { label: (v: any) => `${v.label}: ${v.raw} (${total ? Math.round(v.raw / total * 100) : 0}%)` } } },
            cutout: '68%' },
        });
      }

      // C4 — multi-cours S/S
      if (c4Ref.current && courseWeeks.length) {
        const allWeeks = [...new Set(courseWeeks.flatMap(cw => [...cw.weeks.keys()]))].sort();
        charts.current.c4 = new Chart(c4Ref.current, {
          type: 'line',
          data: {
            labels: allWeeks.map(weekLabel),
            datasets: courseWeeks.map((cw, i) => ({
              label: cw.courseName,
              data: allWeeks.map(wk => cw.weeks.get(wk) ?? null),
              borderColor: COLORS[i % COLORS.length],
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: COURSE_DASHES[i % COURSE_DASHES.length],
              pointRadius: 3,
              tension: 0.35,
              spanGaps: false,
            })),
          },
          options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: baseScales },
        });
      }

      // C5 — histogramme assiduité
      if (c5Ref.current && assiduity.length) {
        charts.current.c5 = new Chart(c5Ref.current, {
          type: 'bar',
          data: {
            labels: assiduity.map(a => a.label),
            datasets: [{ label: 'Danseurs', data: assiduity.map(a => a.count),
              backgroundColor: '#534AB7', borderRadius: 3, borderSkipped: false }],
          },
          options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false },
              tooltip: { callbacks: {
                title: (v: any) => `${v[0].label} séance${Number(v[0].label) > 1 ? 's' : ''}`,
                label: (v: any) => `${v.raw} danseur${v.raw > 1 ? 's' : ''}`,
              } } },
            scales: {
              x: { ...baseScales.x, title: { display: true, text: 'Nombre de séances suivies', color: tickColor, font: { size: 11 } } },
              y: { ...baseScales.y, title: { display: true, text: 'Danseurs', color: tickColor, font: { size: 11 } }, ticks: { ...baseScales.y.ticks, precision: 0 } },
            } },
        });
      }
    })();

    return () => { cancelled = true; };
  }, [loading, weekStats, courseStats, courseWeeks, statusBreak, assiduity, tab]);

  // ── UI helpers ───────────────────────────────────────────────────────────────

  const { members, trial, walkIn } = statusBreak;
  const statusTotal = members + trial + walkIn;
  const pct = (n: number) => statusTotal ? Math.round(n / statusTotal * 100) : 0;

  const INPUT = 'text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white text-gray-700';
  const CARD  = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-5';

  return (
    <div className="space-y-5 pb-10">
      <h1 className="text-lg font-semibold text-gray-800">Statistiques de présence</h1>

      {/* ── Filtres ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={period} onChange={e => setPeriod(e.target.value)} className={INPUT}>
          <option value="4w">4 dernières semaines</option>
          <option value="8w">8 dernières semaines</option>
          <option value="12w">12 dernières semaines</option>
          <option value="6m">6 derniers mois</option>
        </select>
        <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className={INPUT}>
          <option value="all">Tous les cours</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {loading && <span className="text-xs text-gray-400 flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block" />
          Chargement…
        </span>}
      </div>

      {/* ── Métriques ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Présences cette semaine', value: metrics.thisWeek, sub: null },
          { label: 'Danseurs uniques / sem.', value: metrics.uniqueThisWeek, sub: null },
          { label: 'Taux de retour', value: `${metrics.returnRate}%`, sub: 'vs sem. précédente' },
          { label: 'Moy. par séance', value: metrics.avgPerSession, sub: 'sur la période' },
        ].map(m => (
          <div key={m.label} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500 mb-1.5">{m.label}</p>
            <p className="text-2xl font-semibold text-gray-800">{m.value}</p>
            {m.sub && <p className="text-xs text-gray-400 mt-1">{m.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Évolution S/S ── */}
      <div className={CARD}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-sm font-semibold text-gray-800">Évolution semaine par semaine</p>
            <p className="text-xs text-gray-400 mt-0.5">Présences totales et danseurs uniques</p>
          </div>
          <div className="flex gap-1.5">
            {(['both','total','unique'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${tab === t ? 'bg-blue-50 text-blue-600 border-blue-200' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {t === 'both' ? 'Comparaison' : t === 'total' ? 'Totales' : 'Uniques'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-4 mb-3 mt-2">
          {tab !== 'unique' && <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-0.5 bg-blue-500 inline-block rounded" />Présences totales</span>}
          {tab !== 'total'  && <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-0.5 border-t-2 border-dashed border-teal-600 inline-block" />Danseurs uniques</span>}
        </div>
        <div style={{ position: 'relative', height: 240 }}>
          <canvas ref={c1Ref} role="img" aria-label="Évolution hebdomadaire des présences" />
        </div>
      </div>

      {/* ── Par cours + Statuts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className={CARD}>
          <p className="text-sm font-semibold text-gray-800 mb-0.5">Moyenne par cours</p>
          <p className="text-xs text-gray-400 mb-4">Sur la période sélectionnée</p>
          <div style={{ position: 'relative', height: 200 }}>
            <canvas ref={c2Ref} role="img" aria-label="Présence moyenne par cours" />
          </div>
        </div>

        <div className={CARD}>
          <p className="text-sm font-semibold text-gray-800 mb-0.5">Répartition par statut</p>
          <p className="text-xs text-gray-400 mb-3">Membres / essai / visiteurs</p>
          <div className="flex gap-3 mb-3 flex-wrap">
            {[
              { label: 'Membres', n: members, color: 'bg-blue-500' },
              { label: "Essai", n: trial, color: 'bg-amber-400' },
              { label: 'Visiteurs', n: walkIn, color: 'bg-teal-500' },
            ].map(s => (
              <span key={s.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`w-2.5 h-2.5 rounded-sm ${s.color}`} />
                {s.label} <strong className="text-gray-800">{pct(s.n)}%</strong>
                <span className="text-gray-400">({s.n})</span>
              </span>
            ))}
          </div>
          <div style={{ position: 'relative', height: 160 }}>
            <canvas ref={c3Ref} role="img" aria-label="Répartition membres essai visiteurs" />
          </div>
        </div>
      </div>

      {/* ── Multi-cours S/S ── */}
      {courseFilter === 'all' && courseWeeks.length > 1 && (
        <div className={CARD}>
          <p className="text-sm font-semibold text-gray-800 mb-0.5">Suivi par cours récurrent</p>
          <p className="text-xs text-gray-400 mb-3">Présences semaine par semaine, un cours par ligne</p>
          <div className="flex flex-wrap gap-3 mb-4">
            {courseWeeks.map((cw, i) => (
              <span key={cw.courseId} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-4 h-0.5 inline-block rounded" style={{ background: COLORS[i % COLORS.length], ...(COURSE_DASHES[i % COURSE_DASHES.length]?.length ? { border: 'none', borderTop: `2px dashed ${COLORS[i % COLORS.length]}`, background: 'transparent' } : {}) }} />
                {cw.courseName}
              </span>
            ))}
          </div>
          <div style={{ position: 'relative', height: 260 }}>
            <canvas ref={c4Ref} role="img" aria-label="Suivi multi-cours semaine par semaine" />
          </div>
        </div>
      )}

      {/* ── Assiduité individuelle ── */}
      {assiduity.length > 0 && (
        <div className={CARD}>
          <p className="text-sm font-semibold text-gray-800 mb-0.5">Assiduité individuelle</p>
          <p className="text-xs text-gray-400 mb-4">Nombre de danseurs selon leur nombre de séances suivies</p>
          <div style={{ position: 'relative', height: 220 }}>
            <canvas ref={c5Ref} role="img" aria-label="Histogramme assiduité par danseur" />
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && weekStats.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">Aucune donnée de présence sur cette période.</p>
          <p className="text-xs mt-1">Essayez d'élargir la plage de dates.</p>
        </div>
      )}
    </div>
  );
}
