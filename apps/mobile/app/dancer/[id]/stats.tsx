import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import Svg, { Path, Rect, G, Text as SvgText, Line, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import { db } from '@/lib/firebase';
import BottomTabBar from '@/components/BottomTabBar';

// ── Types ─────────────────────────────────────────────────────────────────────

type RawSession    = { id: string; courseId: string; date: string; status: string };
type RawAttendance = { id: string; sessionId: string; dancerId: string; status: string };
type WeekStat      = { label: string; total: number; unique: number };
type CourseStat    = { name: string; avg: number };
type SeasonEntry   = { id: string; label: string; from: string; to: string; isActive: boolean };
type PeriodFilter  =
  | { kind: 'weeks'; weeks: number }
  | { kind: 'season'; id: string };

const WEEK_SHORTCUTS = [
  { weeks: 4,  label: '4 sem.' },
  { weeks: 8,  label: '8 sem.' },
  { weeks: 12, label: '12 sem.' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function tsToDate(ts: any): string {
  if (!ts) return '';
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString().slice(0, 10);
  if (typeof ts.seconds === 'number')  return new Date(ts.seconds * 1000).toISOString().slice(0, 10);
  return String(ts).slice(0, 10);
}

function getMondayKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return mon.toISOString().slice(0, 10);
}

function weekLabel(key: string): string {
  const d = new Date(key + 'T12:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
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

const CHART_COLORS = ['#378ADD', '#534AB7', '#1D9E75', '#EF9F27', '#D4537E', '#E24B4A'];

// ── SVG Charts ────────────────────────────────────────────────────────────────

function LineChart({ data, labels, color, width }: {
  data: number[]; labels: string[]; color: string; width: number;
}) {
  const H = 130; const PAD = { top: 12, bottom: 28, left: 28, right: 8 };
  const W = width - PAD.left - PAD.right;
  const n = data.length;
  if (n < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xStep = W / (n - 1);
  const xOf = (i: number) => PAD.left + i * xStep;
  const yOf = (v: number) => PAD.top + (1 - (v - min) / range) * (H - PAD.top - PAD.bottom);
  const areaPath = `M${xOf(0)},${H - PAD.bottom} ` +
    data.map((v, i) => `L${xOf(i)},${yOf(v)}`).join(' ') +
    ` L${xOf(n - 1)},${H - PAD.bottom} Z`;
  const linePath = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(v)}`).join(' ');
  const step = Math.ceil(n / 6);
  return (
    <Svg width={width} height={H}>
      <Line x1={PAD.left} y1={H - PAD.bottom} x2={PAD.left + W} y2={H - PAD.bottom} stroke="#E5E7EB" strokeWidth={1} />
      <Path d={areaPath} fill={color} fillOpacity={0.1} />
      <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => i % step === 0 ? (
        <G key={i}>
          <Circle cx={xOf(i)} cy={yOf(v)} r={3} fill={color} />
          <SvgText x={xOf(i)} y={H - PAD.bottom + 14} fontSize={9} fill="#9CA3AF" textAnchor="middle">{labels[i]}</SvgText>
        </G>
      ) : null)}
      <SvgText x={PAD.left - 4} y={PAD.top + 4} fontSize={9} fill="#9CA3AF" textAnchor="end">{max}</SvgText>
      <SvgText x={PAD.left - 4} y={H - PAD.bottom} fontSize={9} fill="#9CA3AF" textAnchor="end">{min}</SvgText>
    </Svg>
  );
}

function HBarChart({ data, width }: { data: CourseStat[]; width: number }) {
  const barH = 22; const gap = 8; const labelW = 110;
  const H = data.length * (barH + gap) + 8;
  const maxVal = Math.max(...data.map(d => d.avg), 1);
  const barW = width - labelW - 36;
  return (
    <Svg width={width} height={H}>
      {data.map((d, i) => {
        const w = (d.avg / maxVal) * barW;
        const y = i * (barH + gap) + 4;
        return (
          <G key={d.name}>
            <SvgText x={0} y={y + barH / 2 + 4} fontSize={10} fill="#6B7280">
              {d.name.length > 16 ? d.name.slice(0, 14) + '…' : d.name}
            </SvgText>
            <Rect x={labelW} y={y} width={Math.max(w, 2)} height={barH} rx={4}
              fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.85} />
            <SvgText x={labelW + w + 5} y={y + barH / 2 + 4} fontSize={10} fill="#374151" fontWeight="500">
              {d.avg}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function DonutChart({ members, trial, walkIn, size = 120 }: {
  members: number; trial: number; walkIn: number; size?: number;
}) {
  const total = members + trial + walkIn;
  if (!total) return null;
  const cx = size / 2; const cy = size / 2; const r = size / 2 - 10; const stroke = 18;
  const circ = 2 * Math.PI * r;
  const segs = [
    { value: members, color: '#378ADD' },
    { value: trial,   color: '#EF9F27' },
    { value: walkIn,  color: '#1D9E75' },
  ].filter(s => s.value > 0);
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      {segs.map((s, i) => {
        const dash = (s.value / total) * circ;
        const el = (
          <Circle key={i} cx={cx} cy={cy} r={r} stroke={s.color} strokeWidth={stroke}
            fill="none" strokeDasharray={`${dash} ${circ}`} strokeDashoffset={-offset}
            rotation={-90} originX={cx} originY={cy} />
        );
        offset += dash;
        return el;
      })}
      <SvgText x={cx} y={cy + 5} fontSize={13} fontWeight="600" fill="#111827" textAnchor="middle">
        {total}
      </SvgText>
    </Svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const chartW  = screenW - 40;
  const today   = new Date().toISOString().slice(0, 10);

  // Filters
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter | null>(null);
  const [courseFilter, setCourseFilter] = useState<string | null>(null);
  const [lineMode, setLineMode]         = useState<'total' | 'unique'>('total');

  // Seasons list (loaded once)
  const [seasons, setSeasons]             = useState<SeasonEntry[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(true);

  // Raw data (reloaded when season changes)
  const [loading, setLoading]             = useState(false);
  const [courses, setCourses]             = useState<{ id: string; name: string }[]>([]);
  const [rawSessions, setRawSessions]     = useState<RawSession[]>([]);
  const [attBySession, setAttBySession]   = useState<Map<string, RawAttendance[]>>(new Map());
  const [dancerMap, setDancerMap]         = useState<Map<string, string[]>>(new Map());

  // 1. Load seasons once at mount
  useEffect(() => {
    getDocs(query(collection(db, 'seasons'), orderBy('startDate', 'desc')))
      .then(snap => {
        const list: SeasonEntry[] = snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id:       d.id,
            label:    data.label ?? d.id,
            from:     tsToDate(data.startDate),
            to:       tsToDate(data.endDate),
            isActive: data.isActive ?? false,
          };
        });
        setSeasons(list);
        // Auto-select active season, else most recent
        const active = list.find(s => s.isActive) ?? list[0];
        if (active) setPeriodFilter({ kind: 'season', id: active.id });
      })
      .catch(() => {})
      .finally(() => setSeasonsLoading(false));
  }, []);

  // 2. Load data when period filter changes
  const load = useCallback(async () => {
    if (!periodFilter) return;
    if (periodFilter.kind === 'season' && !seasons.length) return;

    setLoading(true);
    setCourseFilter(null);
    try {
      let from: string, to: string;
      if (periodFilter.kind === 'weeks') {
        const d = new Date();
        d.setDate(d.getDate() - periodFilter.weeks * 7);
        from = d.toISOString().slice(0, 10);
        to   = today;
      } else {
        const season = seasons.find(s => s.id === periodFilter.id);
        if (!season) return;
        from = season.from;
        to   = season.to < today ? season.to : today;
      }

      const courseSnap = await getDocs(collection(db, 'courses'));
      const cMap = new Map<string, string>();
      courseSnap.docs.forEach(d => cMap.set(d.id, (d.data() as any).name ?? d.id));

      const sessSnap = await getDocs(query(
        collection(db, 'sessions'),
        where('date', '>=', from),
        where('date', '<=', to),
        orderBy('date'),
      ));
      const sessions: RawSession[] = sessSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as RawSession))
        .filter(s => s.status !== 'cancelled');

      setRawSessions(sessions);

      if (!sessions.length) {
        setAttBySession(new Map()); setDancerMap(new Map()); setCourses([]); return;
      }

      // Courses active in this season
      const activeCourseIds = [...new Set(sessions.map(s => s.courseId))];
      setCourses(activeCourseIds
        .map(cid => ({ id: cid, name: cMap.get(cid) ?? cid }))
        .sort((a, b) => a.name.localeCompare(b.name)));

      const attendances = await batchAttendances(sessions.map(s => s.id));

      const abs = new Map<string, RawAttendance[]>();
      attendances.forEach(a => {
        if (!abs.has(a.sessionId)) abs.set(a.sessionId, []);
        abs.get(a.sessionId)!.push(a);
      });
      setAttBySession(abs);

      // Dancer roles
      const dancerIds = [...new Set(attendances.map(a => a.dancerId))];
      const chunks: string[][] = [];
      for (let i = 0; i < dancerIds.length; i += 30) chunks.push(dancerIds.slice(i, i + 30));
      const dSnaps = await Promise.all(chunks.map(c =>
        getDocs(query(collection(db, 'dancers'), where('__name__', 'in', c)))
      ));
      const dm = new Map<string, string[]>();
      dSnaps.flatMap(s => s.docs).forEach(d => dm.set(d.id, (d.data() as any).roles ?? []));
      setDancerMap(dm);
    } finally {
      setLoading(false);
    }
  }, [periodFilter, seasons, today]);

  useEffect(() => { load(); }, [load]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const filteredSessions = useMemo(
    () => courseFilter ? rawSessions.filter(s => s.courseId === courseFilter) : rawSessions,
    [rawSessions, courseFilter],
  );

  const filteredAttendances = useMemo(
    () => filteredSessions.flatMap(s => attBySession.get(s.id) ?? []),
    [filteredSessions, attBySession],
  );

  const weekStats = useMemo<WeekStat[]>(() => {
    const weekMap = new Map<string, { total: number; ids: Set<string> }>();
    filteredSessions.forEach(s => {
      const wk = getMondayKey(s.date);
      if (!weekMap.has(wk)) weekMap.set(wk, { total: 0, ids: new Set() });
      const e = weekMap.get(wk)!;
      (attBySession.get(s.id) ?? []).forEach(a => { e.total++; e.ids.add(a.dancerId); });
    });
    return [...weekMap.keys()].sort().map(wk => ({
      label: weekLabel(wk),
      total: weekMap.get(wk)!.total,
      unique: weekMap.get(wk)!.ids.size,
    }));
  }, [filteredSessions, attBySession]);

  const courseStats = useMemo<CourseStat[]>(() => {
    if (courseFilter) return [];
    const cAgg = new Map<string, { sessions: number; total: number }>();
    rawSessions.forEach(s => {
      if (!cAgg.has(s.courseId)) cAgg.set(s.courseId, { sessions: 0, total: 0 });
      const e = cAgg.get(s.courseId)!;
      e.sessions++;
      e.total += (attBySession.get(s.id) ?? []).length;
    });
    return [...cAgg.entries()]
      .map(([cid, v]) => ({
        name: courses.find(c => c.id === cid)?.name ?? cid,
        avg:  v.sessions ? Math.round(v.total / v.sessions * 10) / 10 : 0,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 6);
  }, [rawSessions, attBySession, courses, courseFilter]);

  const statusBreak = useMemo(() => {
    let members = 0, trial = 0, walkIn = 0;
    filteredAttendances.forEach(a => {
      if (a.status === 'walk-in') { walkIn++; return; }
      if (dancerMap.get(a.dancerId)?.includes('trial')) trial++;
      else members++;
    });
    return { members, trial, walkIn };
  }, [filteredAttendances, dancerMap]);

  const metrics = useMemo(() => {
    const weekMap = new Map<string, { total: number; ids: Set<string> }>();
    filteredSessions.forEach(s => {
      const wk = getMondayKey(s.date);
      if (!weekMap.has(wk)) weekMap.set(wk, { total: 0, ids: new Set() });
      const e = weekMap.get(wk)!;
      (attBySession.get(s.id) ?? []).forEach(a => { e.total++; e.ids.add(a.dancerId); });
    });
    const curWk  = getMondayKey(today);
    const prevWk = getMondayKey(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
    const thisW  = weekMap.get(curWk)  ?? { total: 0, ids: new Set<string>() };
    const prevW  = weekMap.get(prevWk) ?? { total: 0, ids: new Set<string>() };
    const ret = prevW.ids.size > 0
      ? Math.round([...thisW.ids].filter(i => prevW.ids.has(i)).length / prevW.ids.size * 100)
      : 0;
    const avg = filteredSessions.length
      ? Math.round(filteredAttendances.length / filteredSessions.length * 10) / 10
      : 0;
    return { thisWeek: thisW.total, uniqueThisWeek: thisW.ids.size, returnRate: ret, avg };
  }, [filteredSessions, filteredAttendances, attBySession, today]);

  const { members, trial, walkIn } = statusBreak;
  const statTotal = members + trial + walkIn;
  const pct = (n: number) => statTotal ? Math.round(n / statTotal * 100) : 0;
  const lineData   = weekStats.map(w => lineMode === 'total' ? w.total : w.unique);
  const lineLabels = weekStats.map(w => w.label);
  const hasData    = weekStats.length > 0;
  const selectedCourse = courses.find(c => c.id === courseFilter);

  const isLoading = seasonsLoading || loading;

  return (
    <View style={[s.root, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Statistiques</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Filter bar */}
      <View style={s.filterBar}>
        {/* Période : semaines rapides + saisons dans la même ligne */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterScrollContent}
        >
          {/* Raccourcis semaines */}
          {WEEK_SHORTCUTS.map(w => {
            const active = periodFilter?.kind === 'weeks' && periodFilter.weeks === w.weeks;
            return (
              <TouchableOpacity
                key={w.weeks}
                onPress={() => setPeriodFilter({ kind: 'weeks', weeks: w.weeks })}
                style={[s.chip, active && s.chipWeeksActive]}
                activeOpacity={0.7}
              >
                <Text style={[s.chipText, active && s.chipTextWeeksActive]}>{w.label}</Text>
              </TouchableOpacity>
            );
          })}

          {/* Séparateur visuel */}
          {seasons.length > 0 && <View style={s.chipSep} />}

          {/* Saisons */}
          {seasons.map(season => {
            const active = periodFilter?.kind === 'season' && periodFilter.id === season.id;
            return (
              <TouchableOpacity
                key={season.id}
                onPress={() => setPeriodFilter({ kind: 'season', id: season.id })}
                style={[s.chip, active && s.chipSeasonActive]}
                activeOpacity={0.7}
              >
                {season.isActive && <View style={s.activeDot} />}
                <Text style={[s.chipText, active && s.chipTextSeasonActive]}>{season.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Course chips */}
        {courses.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.filterScroll}
            contentContainerStyle={s.filterScrollContent}
          >
            <TouchableOpacity
              onPress={() => setCourseFilter(null)}
              style={[s.chip, courseFilter === null && s.chipCourseActive]}
              activeOpacity={0.7}
            >
              <Text style={[s.chipText, courseFilter === null && s.chipTextCourseActive]}>Tous les cours</Text>
            </TouchableOpacity>
            {courses.map(c => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setCourseFilter(c.id === courseFilter ? null : c.id)}
                style={[s.chip, courseFilter === c.id && s.chipCourseActive]}
                activeOpacity={0.7}
              >
                <Text style={[s.chipText, courseFilter === c.id && s.chipTextCourseActive]}>
                  {c.name.length > 22 ? c.name.slice(0, 20) + '…' : c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />
      ) : !hasData ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>Aucune donnée pour cette saison.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 110 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {/* Metric cards */}
          <View style={s.metricGrid}>
            {[
              { label: 'Cette semaine', value: String(metrics.thisWeek) },
              { label: 'Danseurs uniques', value: String(metrics.uniqueThisWeek) },
              { label: 'Taux de retour', value: `${metrics.returnRate}%` },
              { label: 'Moy. / séance', value: String(metrics.avg) },
            ].map(m => (
              <View key={m.label} style={s.metricCard}>
                <Text style={s.metricLabel}>{m.label}</Text>
                <Text style={s.metricValue}>{m.value}</Text>
              </View>
            ))}
          </View>

          {/* Line chart */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Semaine / semaine</Text>
              <View style={s.toggleRow}>
                {(['total', 'unique'] as const).map(m => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setLineMode(m)}
                    style={[s.toggle, lineMode === m && s.toggleActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.toggleText, lineMode === m && s.toggleTextActive]}>
                      {m === 'total' ? 'Totales' : 'Uniques'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <LineChart
              data={lineData}
              labels={lineLabels}
              color={lineMode === 'total' ? '#378ADD' : '#1D9E75'}
              width={chartW}
            />
          </View>

          {/* Bars par cours */}
          {courseStats.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Moy. de présence par cours</Text>
              <Text style={s.cardSub}>Tous cours — saison en cours</Text>
              <View style={{ marginTop: 14 }}>
                <HBarChart data={courseStats} width={chartW} />
              </View>
            </View>
          )}

          {/* Statuts */}
          {statTotal > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Répartition par statut</Text>
              <Text style={s.cardSub}>
                {statTotal} présences{selectedCourse ? ` — ${selectedCourse.name}` : ''}
              </Text>
              <View style={s.donutRow}>
                <DonutChart members={members} trial={trial} walkIn={walkIn} size={110} />
                <View style={s.donutLegend}>
                  {[
                    { label: 'Membres',   n: members, color: '#378ADD' },
                    { label: 'Essai',     n: trial,   color: '#EF9F27' },
                    { label: 'Visiteurs', n: walkIn,  color: '#1D9E75' },
                  ].filter(r => r.n > 0).map(r => (
                    <View key={r.label} style={s.legendRow}>
                      <View style={[s.legendDot, { backgroundColor: r.color }]} />
                      <Text style={s.legendText}>{r.label}</Text>
                      <Text style={s.legendPct}>{pct(r.n)}%</Text>
                      <Text style={s.legendN}>({r.n})</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      <BottomTabBar dancerId={id} bottomInset={insets.bottom} />
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,.08)' },
  backBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  backChevron: { fontSize: 24, color: '#374151', marginTop: -2 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },

  filterBar:           { backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,.06)', paddingBottom: 10, gap: 0 },
  filterScroll:        { flexGrow: 0 },
  filterScrollContent: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },

  chip:                 { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: 'rgba(0,0,0,.12)', backgroundColor: 'transparent' },
  chipWeeksActive:      { backgroundColor: '#F0FDF4', borderColor: '#1D9E75' },
  chipSeasonActive:     { backgroundColor: '#EBF4FD', borderColor: '#378ADD' },
  chipCourseActive:     { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' },
  chipText:             { fontSize: 12, color: Colors.textSecondary },
  chipTextWeeksActive:  { color: '#0F6E56', fontWeight: '600' },
  chipTextSeasonActive: { color: '#185FA5', fontWeight: '600' },
  chipTextCourseActive: { color: '#5B21B6', fontWeight: '600' },
  chipSep:              { width: 1, height: 20, backgroundColor: 'rgba(0,0,0,.12)', marginHorizontal: 4, alignSelf: 'center' },
  activeDot:            { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1D9E75' },

  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  metricCard: { flex: 1, minWidth: '45%', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: 'rgba(0,0,0,.07)' },
  metricLabel:{ fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  metricValue:{ fontSize: 22, fontWeight: '600', color: Colors.text },

  card:      { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 0.5, borderColor: 'rgba(0,0,0,.07)', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  cardHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  cardSub:   { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },

  toggleRow:       { flexDirection: 'row', gap: 4 },
  toggle:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5, borderColor: 'rgba(0,0,0,.12)' },
  toggleActive:    { backgroundColor: '#EBF4FD', borderColor: '#378ADD' },
  toggleText:      { fontSize: 11, color: Colors.textSecondary },
  toggleTextActive:{ color: '#185FA5', fontWeight: '600' },

  donutRow:   { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 12 },
  donutLegend:{ flex: 1, gap: 10 },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 8, height: 8, borderRadius: 2 },
  legendText: { flex: 1, fontSize: 12, color: Colors.text },
  legendPct:  { fontSize: 13, fontWeight: '600', color: Colors.text },
  legendN:    { fontSize: 11, color: Colors.textSecondary },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: Colors.textSecondary },
});
