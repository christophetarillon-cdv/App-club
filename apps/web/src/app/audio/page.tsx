'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'; // where used for memberships
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/AppShell';
import type { Media } from '@cdv/types';

interface Season   { id: string; label: string; isActive: boolean; }
interface DanceStyle { id: string; name: string; color?: string; }
interface Course   { id: string; name: string; danceStyleId: string; levelId: string; }
interface Level    { id: string; name: string; }

function formatDuration(secs?: number) {
  if (!secs) return null;
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AudioPage() {
  const { user, account, dancers } = useAuth();

  const [allMedia, setAllMedia]           = useState<Media[]>([]);
  const [seasons, setSeasons]             = useState<Season[]>([]);
  const [styles, setStyles]               = useState<DanceStyle[]>([]);
  const [courses, setCourses]             = useState<Course[]>([]);
  const [levels, setLevels]               = useState<Level[]>([]);
  const [paidSeasonIds, setPaidSeasonIds] = useState<string[]>([]);
  const [hasActiveTrial, setHasActiveTrial] = useState(false);
  const [loading, setLoading]             = useState(true);

  const [filterSeason, setFilterSeason]   = useState('');
  const [filterStyle, setFilterStyle]     = useState('');
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [speeds, setSpeeds]               = useState<Map<string, number>>(new Map());
  const [downloading, setDownloading]     = useState<string | null>(null);
  const audioEls = useRef<Map<string, HTMLAudioElement>>(new Map());

  const handleDownload = useCallback(async (m: { id: string; title: string; sourceUrl: string }) => {
    setDownloading(m.id);
    try {
      const res = await fetch(m.sourceUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${m.title}.mp3`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* silencieux */ } finally { setDownloading(null); }
  }, []);

  const isAdminOrInstructor =
    account?.roles?.includes('admin') ||
    dancers.some(d => d.roles.includes('admin') || d.roles.includes('instructor'));

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const trialActive = dancers.some(d =>
      d.roles.includes('trial') && d.trialExpiresAt && (d.trialExpiresAt as any).toDate?.() > now
    );
    setHasActiveTrial(trialActive);

    Promise.all([
      getDocs(query(collection(db, 'media'), orderBy('uploadedAt', 'desc'))),
      getDocs(collection(db, 'seasons')),
      getDocs(collection(db, 'danceStyles')),
      getDocs(collection(db, 'courses')),
      getDocs(collection(db, 'levels')),
      getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
    ]).then(([mediaSnap, seasonSnap, styleSnap, courseSnap, levelSnap, membershipSnap]) => {
      setAllMedia(mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as Media)).filter(m => m.type === 'audio'));

      const s = seasonSnap.docs.map(d => ({ id: d.id, label: d.data().label ?? d.id, isActive: d.data().isActive === true }))
        .sort((a, b) => b.label > a.label ? 1 : -1);
      setSeasons(s);
      const active = s.find(s2 => s2.isActive);
      setFilterSeason(active?.id ?? s[0]?.id ?? '');

      setStyles(styleSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '', color: d.data().color })));
      setCourses(courseSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '', danceStyleId: d.data().danceStyleId ?? '', levelId: d.data().levelId ?? '' })));
      setLevels(levelSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '' })));

      const paid = membershipSnap.docs
        .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
        .map(d => d.data().seasonId as string).filter(Boolean);
      setPaidSeasonIds([...new Set(paid)]);
    }).finally(() => setLoading(false));
  }, [user, dancers]);

  const canAccess = (m: Media): boolean => {
    if (isAdminOrInstructor) return true;
    if (hasActiveTrial) return true;
    if (!m.seasonId) return paidSeasonIds.length > 0;
    return paidSeasonIds.includes(m.seasonId);
  };

  const styleMap  = new Map(styles.map(s => [s.id, s]));
  const courseMap = new Map(courses.map(c => [c.id, c]));
  const levelMap  = new Map(levels.map(l => [l.id, l]));

  const visible = allMedia.filter(m => {
    if (!canAccess(m)) return false;
    if (filterStyle && m.danceStyleId !== filterStyle) return false;
    if (filterSeason === 'intemporel') return !m.seasonId;
    if (filterSeason) return m.seasonId === filterSeason;
    return true;
  });

  const locked = allMedia.filter(m => {
    if (canAccess(m)) return false;
    if (filterSeason === 'intemporel') return !m.seasonId;
    if (filterSeason) return m.seasonId === filterSeason;
    return true;
  }).length;

  return (
    <AppShell>
      <div className="relative overflow-hidden pb-8" style={{
        background: 'linear-gradient(180deg, #2F86C0 0%, #7FBFE3 33%, #D8EAF3 66%, #F9F7F4 100%)',
      }}>
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <h1 className="text-2xl font-extrabold text-white">Audio</h1>
        </div>
        <svg className="absolute bottom-0 left-0 w-full h-8 text-background" viewBox="0 0 400 44" preserveAspectRatio="none" fill="currentColor">
          <path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" />
        </svg>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-5 -mt-4 relative">

        {/* Filters */}
        <div className="flex gap-2 flex-wrap mb-5">
          <div className="flex gap-1.5 overflow-x-auto">
            <button onClick={() => setFilterStyle('')}
              className={`text-xs px-3 py-1.5 rounded-full font-medium border whitespace-nowrap transition-colors ${
                !filterStyle ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>Tous</button>
            {styles.map(s => (
              <button key={s.id} onClick={() => setFilterStyle(filterStyle === s.id ? '' : s.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium border whitespace-nowrap transition-colors ${
                  filterStyle === s.id ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                style={filterStyle === s.id ? { backgroundColor: s.color, borderColor: s.color } : undefined}>
                {s.name}
              </button>
            ))}
          </div>
          <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)}
            className="ml-auto border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none">
            <option value="">Toutes saisons</option>
            <option value="intemporel">Intemporels</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' · en cours' : ''}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Chargement…</div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 px-6 py-12 text-center">
            <p className="text-gray-500 font-medium">Aucun audio disponible.</p>
            {paidSeasonIds.length === 0 && !isAdminOrInstructor && !hasActiveTrial && (
              <p className="text-gray-400 text-sm mt-1">L'accès requiert une cotisation active.</p>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-3">
              {visible.map((m, i) => {
                const style  = m.danceStyleId ? styleMap.get(m.danceStyleId) : undefined;
                const course = m.courseId ? courseMap.get(m.courseId) : undefined;
                const level  = course?.levelId ? levelMap.get(course.levelId) : undefined;
                const accent = style?.color ?? '#1B3A6B';
                const isOpen = expanded === m.id;
                const label  = [style?.name, level?.name].filter(Boolean).join(' · ');
                return (
                  <div key={m.id} className={`${i > 0 ? 'border-t border-gray-100' : ''}`}>
                    <button onClick={() => setExpanded(isOpen ? null : m.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                      {/* Play indicator */}
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${accent}20` }}>
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" style={{ color: accent }}>
                          {isOpen
                            ? <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd"/>
                            : <path d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z"/>
                          }
                        </svg>
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{m.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {label && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: `${accent}20`, color: accent }}>
                              {label}
                            </span>
                          )}
                          {m.durationSeconds && (
                            <span className="text-[10px] text-gray-400">{formatDuration(m.durationSeconds)}</span>
                          )}
                        </div>
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                        className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                        <path d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 space-y-2.5 border-t border-gray-100 pt-3">
                        {m.description && <p className="text-xs text-gray-500">{m.description}</p>}
                        <audio controls crossOrigin="anonymous" src={m.sourceUrl} className="w-full"
                          ref={el => { if (el) audioEls.current.set(m.id, el as HTMLAudioElement); else audioEls.current.delete(m.id); }} />
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 shrink-0">Vitesse</span>
                          <input type="range" min="0.5" max="2" step="0.01" value={speeds.get(m.id) ?? 1}
                            onChange={e => {
                              const val = parseFloat(e.target.value);
                              setSpeeds(prev => new Map(prev).set(m.id, val));
                              const el = audioEls.current.get(m.id);
                              if (el) { el.playbackRate = val; (el as any).preservesPitch = true; }
                            }} className="flex-1 accent-primary" />
                          <span className="text-[10px] text-gray-400 w-8 text-right">{Math.round((speeds.get(m.id) ?? 1) * 100)}%</span>
                        </div>
                        <button onClick={() => handleDownload(m)} disabled={downloading === m.id}
                          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 disabled:opacity-50">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
                          {downloading === m.id ? 'Téléchargement…' : 'Télécharger'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {locked > 0 && (
              <div className="flex items-start gap-2.5 bg-orange-50 border border-orange-200 rounded-2xl p-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-orange-500 shrink-0 mt-0.5">
                  <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                </svg>
                <p className="text-xs text-orange-700">
                  {locked} audio{locked > 1 ? 's' : ''} réservé{locked > 1 ? 's' : ''} aux membres. <a href="/membership" className="underline font-medium">Régler ma cotisation →</a>
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
