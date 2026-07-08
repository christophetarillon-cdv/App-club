'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/AppShell';
import Link from 'next/link';

interface DanceStyle { id: string; name: string; color: string; }
interface Level { id: string; name: string; }
interface Course { id: string; name: string; danceStyleId: string; levelId: string; dayOfWeek: number; startTime: string; endTime: string; roomId: string; }
interface Room { id: string; name: string; }
interface SessionWithCourse {
  id: string; courseId: string; date: string; startTime: string; endTime: string;
  status: 'scheduled' | 'cancelled' | 'extra'; cancellationReason?: string;
  course?: Course; style?: DanceStyle; level?: Level; room?: Room;
}

const DAY_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const MONTH_FR  = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

function getMonday(d: Date): Date {
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0,0,0,0); return m;
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function PlanningPage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [sessions, setSessions] = useState<SessionWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registrationDates, setRegistrationDates] = useState<Map<string, string>>(new Map());

  const loadRefs = useCallback(async () => {
    const [stylesSnap, coursesSnap, roomsSnap, levelsSnap] = await Promise.all([
      getDocs(query(collection(db, 'danceStyles'), orderBy('name'))),
      getDocs(collection(db, 'courses')),
      getDocs(collection(db, 'rooms')),
      getDocs(collection(db, 'levels')),
    ]);
    const styles: DanceStyle[] = stylesSnap.docs.map(d => ({ id: d.id, name: d.data().name, color: d.data().color ?? '#6B7280' }));
    const courses: Course[] = coursesSnap.docs.map(d => ({
      id: d.id, name: d.data().name, danceStyleId: d.data().danceStyleId, levelId: d.data().levelId,
      dayOfWeek: d.data().dayOfWeek, startTime: d.data().startTime, endTime: d.data().endTime, roomId: d.data().roomId,
    }));
    const rooms: Room[] = roomsSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
    const levels: Level[] = levelsSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
    return { styles, courses, rooms, levels };
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { styles, courses, rooms, levels } = await loadRefs();
      const startStr = toDateStr(weekStart);
      const endStr   = toDateStr(addDays(weekStart, 6));
      const snap = await getDocs(query(
        collection(db, 'sessions'),
        where('date', '>=', startStr), where('date', '<=', endStr),
        orderBy('date'), orderBy('startTime'),
      ));
      const courseMap = new Map(courses.map(c => [c.id, c]));
      const styleMap  = new Map(styles.map(s => [s.id, s]));
      const roomMap   = new Map(rooms.map(r => [r.id, r]));
      const levelMap  = new Map(levels.map(l => [l.id, l]));
      setSessions(snap.docs.map(d => {
        const data = d.data(); const course = courseMap.get(data.courseId);
        return { id: d.id, courseId: data.courseId, date: data.date, startTime: data.startTime,
          endTime: data.endTime, status: data.status, cancellationReason: data.cancellationReason,
          course, style: course ? styleMap.get(course.danceStyleId) : undefined,
          level: course ? levelMap.get(course.levelId) : undefined,
          room: course ? roomMap.get(course.roomId) : undefined };
      }));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    setLoading(false);
  }, [weekStart, loadRefs]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'registrations'), where('userId', '==', user.uid), where('status', 'in', ['active', 'waitlist'])))
      .then(snap => {
        const map = new Map<string, string>();
        snap.docs.forEach(d => map.set(d.data().courseId, d.data().registeredAt));
        setRegistrationDates(map);
      });
  }, [user]);

  const filtered = sessions;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = toDateStr(new Date());
  const selectedStr = toDateStr(selectedDay);
  const dayHasSessions = (dateStr: string) => filtered.some(s => s.date === dateStr);

  return (
    <AppShell>
      <div className="relative overflow-hidden pb-8" style={{
        background: 'linear-gradient(180deg, #2F86C0 0%, #7FBFE3 33%, #D8EAF3 66%, #F9F7F4 100%)',
      }}>
        <div className="max-w-3xl mx-auto px-4 pt-6">
          <h1 className="text-2xl font-extrabold text-white">Planning</h1>
        </div>
        <svg className="absolute bottom-0 left-0 w-full h-8 text-background" viewBox="0 0 400 44" preserveAspectRatio="none" fill="currentColor">
          <path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" />
        </svg>
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-5 -mt-4 relative">

        {/* Week navigation */}
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => { setWeekStart(w => addDays(w, -7)); setSelectedDay(d => addDays(d, -7)); }}
            className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 19l-7-7 7-7"/></svg>
          </button>
          <span className="flex-1 text-center text-sm font-medium text-gray-700">
            {days[0]!.getDate()} {MONTH_FR[days[0]!.getMonth()]} – {days[6]!.getDate()} {MONTH_FR[days[6]!.getMonth()]} {days[6]!.getFullYear()}
          </span>
          <button onClick={() => { setWeekStart(w => addDays(w, 7)); setSelectedDay(d => addDays(d, 7)); }}
            className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 5l7 7-7 7"/></svg>
          </button>
          <button onClick={() => { setWeekStart(getMonday(new Date())); setSelectedDay(new Date()); }}
            className="text-xs px-3 h-9 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50">
            Auj.
          </button>
        </div>

        {/* Day strip */}
        <div className="grid grid-cols-7 gap-1.5 mb-5">
          {days.map(day => {
            const ds = toDateStr(day);
            const isToday = ds === today;
            const isSelected = ds === selectedStr;
            const hasSess = dayHasSessions(ds);
            return (
              <button key={ds} onClick={() => setSelectedDay(day)}
                className={`flex flex-col items-center py-2 rounded-xl transition-colors ${
                  isSelected ? 'bg-primary text-white' : isToday ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'
                }`}>
                <span className="text-[9px] font-semibold uppercase tracking-wide">{DAY_SHORT[day.getDay()]}</span>
                <span className="text-base font-bold leading-none mt-0.5">{day.getDate()}</span>
                {hasSess && <span className={`w-1 h-1 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-primary'}`} />}
              </button>
            );
          })}
        </div>

{error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-red-700">Erreur de chargement — {error}</p>
          </div>
        )}

        {/* Sessions du jour sélectionné */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Chargement…</div>
        ) : (() => {
          const daySessions = filtered.filter(s => s.date === selectedStr);
          if (daySessions.length === 0) return (
            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-10 text-center">
              <p className="text-gray-400 text-sm">Aucune séance ce jour.</p>
            </div>
          );
          return (
            <div className="space-y-3">
              {daySessions.map(s => {
                const regDate = registrationDates.get(s.courseId);
                const isRegistered = regDate ? s.date >= regDate : false;
                const accent = s.style?.color ?? '#6B7280';
                return (
                  <div key={s.id}
                    className={`bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow ${s.status === 'cancelled' ? 'opacity-60' : ''}`}>
                    <div className="flex items-stretch gap-0">
                      <div className="w-1 shrink-0 rounded-l-2xl" style={{ backgroundColor: accent }} />
                      <Link href={`/courses/${s.courseId}?date=${s.date}`} className="flex-1 px-4 py-3.5 block">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className={`font-semibold text-sm ${s.status === 'cancelled' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                {s.course?.name ?? s.courseId}
                              </p>
                              {s.style && (
                                <span
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: `${accent}25`, color: accent }}
                                >
                                  {s.style.name}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {s.startTime} – {s.endTime}{s.level ? ` · ${s.level.name}` : ''}{s.room ? ` · ${s.room.name}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {s.status === 'cancelled' && (
                              <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">Annulé</span>
                            )}
                            {isRegistered && s.status !== 'cancelled' && (
                              <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">Inscrit</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </div>
                    <Link href={`/session/${s.id}`}
                      className="block px-4 py-2 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100">
                      Programme & vidéo →
                    </Link>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </AppShell>
  );
}
