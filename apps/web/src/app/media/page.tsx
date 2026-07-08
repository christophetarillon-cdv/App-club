'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/AppShell';
import type { Media } from '@cdv/types';

interface Season   { id: string; label: string; isActive: boolean; }
interface DanceStyle { id: string; name: string; color?: string; }
interface Course   { id: string; name: string; danceStyleId: string; levelId: string; }
interface Level    { id: string; name: string; }
interface Membership { seasonId: string; paymentPlanStatus: string; status: string; }

function VideoThumbnail({ src, bg }: { src: string; bg: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <div className="absolute inset-0" style={{ backgroundColor: bg }}>
      <video
        ref={ref}
        src={src}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={() => { if (ref.current) ref.current.currentTime = 0.1; }}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

function formatDuration(secs?: number) {
  if (!secs) return null;
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Couleur de fond selon le style, fallback navy
function styleBg(color?: string) {
  return color ?? '#1B3A6B';
}

export default function MediaPage() {
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
  const [filterCourse, setFilterCourse]   = useState('');
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [speeds, setSpeeds]               = useState<Map<string, number>>(new Map());
  const [downloading, setDownloading]     = useState<string | null>(null);
  const mediaEls = useRef<Map<string, HTMLAudioElement | HTMLVideoElement>>(new Map());

  const handleDownload = useCallback(async (m: { id: string; title: string; sourceUrl: string; type: string }) => {
    setDownloading(m.id);
    try {
      const res = await fetch(m.sourceUrl);
      const blob = await res.blob();
      const ext = m.type === 'video' ? 'mp4' : 'mp3';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${m.title}.${ext}`; a.click();
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
      setAllMedia(mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as Media)));

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

  // Chips : uniquement les cours qui ont au moins une vidéo accessible
  const courseChips = courses
    .filter(c => allMedia.some(m => m.type === 'video' && m.courseId === c.id && canAccess(m)))
    .map(c => ({
      id: c.id,
      label: [styleMap.get(c.danceStyleId)?.name, levelMap.get(c.levelId)?.name].filter(Boolean).join(' · '),
      color: styleMap.get(c.danceStyleId)?.color,
    }));

  const visible = allMedia.filter(m => {
    if (m.type !== 'video') return false;
    if (!canAccess(m)) return false;
    if (filterCourse && m.courseId !== filterCourse) return false;
    if (filterSeason === 'intemporel') return !m.seasonId;
    if (filterSeason) return m.seasonId === filterSeason;
    return true;
  });

  const locked = allMedia.filter(m => {
    if (m.type !== 'video' || canAccess(m)) return false;
    if (filterSeason === 'intemporel') return !m.seasonId;
    if (filterSeason) return m.seasonId === filterSeason;
    return true;
  }).length;

  return (
    <AppShell>
      <div className="relative overflow-hidden pb-8" style={{
        background: 'linear-gradient(180deg, #2F86C0 0%, #2F86C0 45%, #7FBFE3 70%, #D8EAF3 88%, #F9F7F4 100%)',
      }}>
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <h1 className="text-2xl font-extrabold text-white">Vidéos</h1>
        </div>
        <svg className="absolute bottom-0 left-0 w-full h-8 text-background" viewBox="0 0 400 44" preserveAspectRatio="none" fill="currentColor">
          <path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" />
        </svg>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-5 -mt-4 relative">

        {/* Filters */}
        <div className="flex gap-2 flex-wrap mb-5">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button onClick={() => setFilterCourse('')}
              className={`text-xs px-3 py-1.5 rounded-full font-medium border whitespace-nowrap transition-colors ${
                !filterCourse ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>Tous</button>
            {courseChips.map(c => (
              <button key={c.id} onClick={() => setFilterCourse(filterCourse === c.id ? '' : c.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium border whitespace-nowrap transition-colors ${
                  filterCourse === c.id ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                style={filterCourse === c.id ? { backgroundColor: c.color, borderColor: c.color } : undefined}>
                {c.label}
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
            <p className="text-gray-500 font-medium">Aucun média disponible.</p>
            {paidSeasonIds.length === 0 && !isAdminOrInstructor && !hasActiveTrial && (
              <p className="text-gray-400 text-sm mt-1">L'accès requiert une cotisation active.</p>
            )}
          </div>
        ) : (
          <>
            {/* Grid de vignettes */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              {visible.map(m => {
                const style  = m.danceStyleId ? styleMap.get(m.danceStyleId) : undefined;
                const bg     = styleBg(style?.color);
                const isOpen = expanded === m.id;
                return (
                  <div key={m.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {/* Thumbnail vidéo */}
                    <div className="relative w-full aspect-video overflow-hidden">
                      <VideoThumbnail src={m.sourceUrl} bg={bg} />
                      <button
                        onClick={() => setExpanded(isOpen ? null : m.id)}
                        className="absolute inset-0 flex items-center justify-center group"
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-opacity bg-black/40 ${isOpen ? 'opacity-60' : 'opacity-80 group-hover:opacity-100'}`}>
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white ml-0.5">
                            <path d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z"/>
                          </svg>
                        </div>
                      </button>
                    </div>

                    {/* Info */}
                    <div className="px-3 py-2.5">
                      <p className="text-xs font-semibold text-gray-900 leading-tight truncate">{m.title}</p>
                      {(() => {
                        const levelId = m.levelId ?? (m.courseId ? courseMap.get(m.courseId)?.levelId : undefined);
                        const tag = [style?.name, levelId ? levelMap.get(levelId)?.name : undefined].filter(Boolean).join(' · ');
                        return tag ? <p className="text-[10px] text-gray-400 mt-0.5 truncate">{tag}</p> : null;
                      })()}
                      {m.durationSeconds && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{formatDuration(m.durationSeconds)}</p>
                      )}
                    </div>

                    {/* Player (expanded) */}
                    {isOpen && (
                      <div className="px-3 pb-3 border-t border-gray-100 pt-2.5 space-y-2">
                        {m.description && <p className="text-xs text-gray-500">{m.description}</p>}
                        {m.type === 'audio' ? (
                          <audio controls crossOrigin="anonymous" src={m.sourceUrl} className="w-full"
                            ref={el => { if (el) mediaEls.current.set(m.id, el); else mediaEls.current.delete(m.id); }} />
                        ) : (
                          <video controls crossOrigin="anonymous" src={m.sourceUrl} className="w-full rounded-xl" style={{ maxHeight: 220 }}
                            ref={el => { if (el) mediaEls.current.set(m.id, el); else mediaEls.current.delete(m.id); }} />
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 shrink-0">Vitesse</span>
                          <input type="range" min="0.5" max="2" step="0.01" value={speeds.get(m.id) ?? 1}
                            onChange={e => {
                              const val = parseFloat(e.target.value);
                              setSpeeds(prev => new Map(prev).set(m.id, val));
                              const el = mediaEls.current.get(m.id);
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
              <div className="flex items-start gap-2.5 bg-orange-50 border border-orange-200 rounded-2xl p-4 mt-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-orange-500 shrink-0 mt-0.5">
                  <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                </svg>
                <p className="text-xs text-orange-700">
                  {locked} média{locked > 1 ? 's' : ''} réservé{locked > 1 ? 's' : ''} aux membres. <a href="/membership" className="underline font-medium">Régler ma cotisation →</a>
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
