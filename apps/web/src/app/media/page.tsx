'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/AppShell';
import type { Media } from '@cdv/types';

interface Season   { id: string; label: string; isActive: boolean; }
interface DanceStyle { id: string; name: string; color?: string; }
interface Course   { id: string; name: string; danceStyleId: string; }
interface Membership { seasonId: string; paymentPlanStatus: string; status: string; }

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
  const [paidSeasonIds, setPaidSeasonIds] = useState<string[]>([]);
  const [hasActiveTrial, setHasActiveTrial] = useState(false);
  const [loading, setLoading]             = useState(true);

  const [filterSeason, setFilterSeason]   = useState('active');
  const [filterStyle, setFilterStyle]     = useState('');
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
      getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
    ]).then(([mediaSnap, seasonSnap, styleSnap, courseSnap, membershipSnap]) => {
      setAllMedia(mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as Media)));

      const s = seasonSnap.docs.map(d => ({ id: d.id, label: d.data().label ?? d.id, isActive: d.data().isActive === true }))
        .sort((a, b) => b.label > a.label ? 1 : -1);
      setSeasons(s);

      setStyles(styleSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '', color: d.data().color })));
      setCourses(courseSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '', danceStyleId: d.data().danceStyleId ?? '' })));

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

  const activeSeason = seasons.find(s => s.isActive);
  const styleMap  = new Map(styles.map(s => [s.id, s]));
  const courseMap = new Map(courses.map(c => [c.id, c]));

  const visible = allMedia.filter(m => {
    if (!canAccess(m)) return false;
    if (filterStyle && m.danceStyleId !== filterStyle) return false;
    if (filterSeason === 'active') return !m.seasonId || m.seasonId === activeSeason?.id;
    if (filterSeason === 'intemporel') return !m.seasonId;
    if (filterSeason) return m.seasonId === filterSeason;
    return true;
  });

  // locked media (no access but exists)
  const locked = allMedia.filter(m => !canAccess(m) && (
    filterSeason === 'active' ? (!m.seasonId || m.seasonId === activeSeason?.id) : true
  )).length;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-5">

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
            <option value="active">Saison en cours</option>
            <option value="">Toutes saisons</option>
            <option value="intemporel">Intemporels</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
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
                const course = m.courseId ? courseMap.get(m.courseId) : undefined;
                const bg     = styleBg(style?.color);
                const isOpen = expanded === m.id;
                return (
                  <div key={m.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {/* Thumbnail */}
                    <button onClick={() => setExpanded(isOpen ? null : m.id)}
                      className="relative w-full aspect-video flex items-center justify-center group"
                      style={{ backgroundColor: bg }}>
                      <svg viewBox="0 0 24 24" fill="currentColor" className={`w-8 h-8 text-white transition-opacity ${isOpen ? 'opacity-60' : 'opacity-80 group-hover:opacity-100'}`}>
                        {m.type === 'audio'
                          ? <path d="M19.952 1.651a.75.75 0 01.298.599V16.303a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V6.994l-9 2.572v9.737a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.402-4.909l2.31-.66A1.5 1.5 0 007.5 15.952V4.725a.75.75 0 01.544-.721l10.5-3a.75.75 0 01.408.647z"/>
                          : <path d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z"/>
                        }
                      </svg>
                      {/* Badges danse + niveau */}
                      <div className="absolute bottom-0 inset-x-0 px-2 pb-1.5 flex flex-wrap gap-1">
                        {style && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-black/40 text-white leading-none">
                            {style.name}
                          </span>
                        )}
                        {course && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-black/40 text-white leading-none">
                            {course.name}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Info */}
                    <div className="px-3 py-2.5">
                      <p className="text-xs font-semibold text-gray-900 leading-tight truncate">{m.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${m.type === 'audio' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                          {m.type === 'audio' ? 'Audio' : 'Vidéo'}
                        </span>
                        {m.durationSeconds && <span className="text-[9px] text-gray-400">{formatDuration(m.durationSeconds)}</span>}
                      </div>
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
