'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, query, where, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface DanceStyle { id: string; name: string; color: string; }
interface Course { id: string; name: string; danceStyleId: string; dayOfWeek: number; startTime: string; endTime: string; roomId: string; }
interface Room { id: string; name: string; }
interface SessionWithCourse {
  id: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'cancelled' | 'extra';
  cancellationReason?: string;
  course?: Course;
  style?: DanceStyle;
  room?: Room;
}

const DAY_LABELS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  return `${monday.getDate()} ${MONTH_FR[monday.getMonth()]} – ${sunday.getDate()} ${MONTH_FR[sunday.getMonth()]} ${sunday.getFullYear()}`;
}

export default function PlanningPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [sessions, setSessions] = useState<SessionWithCourse[]>([]);
  const [danceStyles, setDanceStyles] = useState<DanceStyle[]>([]);
  const [styleFilter, setStyleFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registrationDates, setRegistrationDates] = useState<Map<string, string>>(new Map());

  const loadRefs = useCallback(async () => {
    const [stylesSnap, coursesSnap, roomsSnap] = await Promise.all([
      getDocs(query(collection(db, 'danceStyles'), orderBy('name'))),
      getDocs(collection(db, 'courses')),
      getDocs(collection(db, 'rooms')),
    ]);
    const styles: DanceStyle[] = stylesSnap.docs.map(d => ({ id: d.id, name: d.data().name, color: d.data().color }));
    const courses: Course[] = coursesSnap.docs.map(d => ({
      id: d.id, name: d.data().name, danceStyleId: d.data().danceStyleId,
      dayOfWeek: d.data().dayOfWeek, startTime: d.data().startTime, endTime: d.data().endTime,
      roomId: d.data().roomId,
    }));
    const rooms: Room[] = roomsSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
    setDanceStyles(styles);
    return { styles, courses, rooms };
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { styles, courses, rooms } = await loadRefs();

      const start = viewMode === 'week' ? weekStart : selectedDay;
      const end = viewMode === 'week' ? addDays(weekStart, 6) : selectedDay;
      const startStr = toDateStr(start);
      const endStr = toDateStr(end);

      const snap = await getDocs(query(
        collection(db, 'sessions'),
        where('date', '>=', startStr),
        where('date', '<=', endStr),
        orderBy('date'),
        orderBy('startTime'),
      ));

      const courseMap = new Map(courses.map(c => [c.id, c]));
      const styleMap = new Map(styles.map(s => [s.id, s]));
      const roomMap = new Map(rooms.map(r => [r.id, r]));

      const result: SessionWithCourse[] = snap.docs.map(d => {
        const data = d.data();
        const course = courseMap.get(data.courseId);
        return {
          id: d.id,
          courseId: data.courseId,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          status: data.status,
          cancellationReason: data.cancellationReason,
          course,
          style: course ? styleMap.get(course.danceStyleId) : undefined,
          room: course ? roomMap.get(course.roomId) : undefined,
        };
      });

      setSessions(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [weekStart, selectedDay, viewMode, loadRefs]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (!user) return;
    getDocs(query(
      collection(db, 'registrations'),
      where('userId', '==', user.uid),
      where('status', 'in', ['active', 'waitlist']),
    )).then(snap => {
      const map = new Map<string, string>();
      snap.docs.forEach(d => map.set(d.data().courseId, d.data().registeredAt));
      setRegistrationDates(map);
    });
  }, [user]);

  const filtered = styleFilter ? sessions.filter(s => s.style?.id === styleFilter) : sessions;

  const days = viewMode === 'week'
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : [selectedDay];

  const sessionsForDay = (dateStr: string) =>
    filtered.filter(s => s.date === dateStr);

  const today = toDateStr(new Date());

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-700">← Retour</button>
            <h1 className="text-2xl font-bold text-gray-900">Planning</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'week' ? 'day' : 'week')}
              className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
            >
              Vue {viewMode === 'week' ? 'jour' : 'semaine'}
            </button>
          </div>
        </div>

        {/* Navigation semaine / jour */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              if (viewMode === 'week') setWeekStart(w => addDays(w, -7));
              else setSelectedDay(d => addDays(d, -1));
            }}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-600"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-gray-700 flex-1 text-center">
            {viewMode === 'week'
              ? formatWeekLabel(weekStart)
              : `${DAY_LABELS_SHORT[selectedDay.getDay()]} ${selectedDay.getDate()} ${MONTH_FR[selectedDay.getMonth()]} ${selectedDay.getFullYear()}`
            }
          </span>
          <button
            onClick={() => {
              if (viewMode === 'week') setWeekStart(w => addDays(w, 7));
              else setSelectedDay(d => addDays(d, 1));
            }}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-600"
          >
            ›
          </button>
          <button
            onClick={() => { setWeekStart(getMonday(new Date())); setSelectedDay(new Date()); }}
            className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            Aujourd'hui
          </button>
        </div>

        {/* Filtre styles */}
        {danceStyles.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            <button
              onClick={() => setStyleFilter(null)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium border ${!styleFilter ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            >
              Tous
            </button>
            {danceStyles.map(s => (
              <button
                key={s.id}
                onClick={() => setStyleFilter(styleFilter === s.id ? null : s.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${styleFilter === s.id ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                style={styleFilter === s.id ? { backgroundColor: s.color, borderColor: s.color } : undefined}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-red-700 font-medium">Erreur de chargement</p>
            <p className="text-xs text-red-500 mt-0.5">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-12">Chargement…</p>
        ) : (
          <div className={`grid gap-4 ${viewMode === 'week' ? 'grid-cols-7' : 'grid-cols-1 max-w-sm mx-auto'}`}>
            {days.map(day => {
              const dateStr = toDateStr(day);
              const daySessions = sessionsForDay(dateStr);
              const isToday = dateStr === today;
              return (
                <div key={dateStr}>
                  <div
                    className={`text-center mb-2 py-1 rounded-lg ${isToday ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
                    onClick={() => { if (viewMode === 'week') { setSelectedDay(day); setViewMode('day'); } }}
                    style={{ cursor: viewMode === 'week' ? 'pointer' : 'default' }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide">{DAY_LABELS_SHORT[day.getDay()]}</p>
                    <p className="text-lg font-bold leading-none">{day.getDate()}</p>
                  </div>
                  <div className="space-y-1.5">
                    {daySessions.length === 0 && (
                      <p className="text-xs text-gray-300 text-center py-2">—</p>
                    )}
                    {daySessions.map(s => {
                      const regDate = registrationDates.get(s.courseId);
                      const isRegistered = regDate ? s.date >= regDate : false;
                      return (
                        <Link
                          key={s.id}
                          href={`/courses/${s.courseId}?date=${s.date}`}
                          className={`block rounded-lg px-2 py-1.5 text-xs leading-tight transition-opacity ${s.status === 'cancelled' ? 'opacity-50' : 'hover:opacity-90'}`}
                          style={{ backgroundColor: (s.style?.color ?? '#6B7280') + '22', borderLeft: `3px solid ${s.style?.color ?? '#6B7280'}` }}
                        >
                          <p className={`font-semibold ${s.status === 'cancelled' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {s.course?.name ?? s.courseId}
                          </p>
                          <p className="text-gray-500">{s.startTime}–{s.endTime}</p>
                          {s.room && <p className="text-gray-400">{s.room.name}</p>}
                          {s.status === 'cancelled' && (
                            <p className="text-red-400 font-medium">Annulée</p>
                          )}
                          {isRegistered && s.status !== 'cancelled' && (
                            <p className="text-green-600 font-medium mt-0.5">Inscrit</p>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
