'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Media } from '@cdv/types';

interface Season { id: string; label: string; isActive: boolean; }
interface DanceStyle { id: string; name: string; color?: string; }
interface Membership { seasonId: string; paymentPlanStatus: string; status: string; }

function formatDuration(secs?: number) {
  if (!secs) return null;
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MediaPage() {
  const { user, account, dancers } = useAuth();
  const router = useRouter();

  const [allMedia, setAllMedia] = useState<Media[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [styles, setStyles] = useState<DanceStyle[]>([]);
  const [paidSeasonIds, setPaidSeasonIds] = useState<string[]>([]);
  const [hasActiveTrial, setHasActiveTrial] = useState(false);
  const [loading, setLoading] = useState(true);

  const [filterType, setFilterType] = useState<'' | 'audio' | 'video'>('');
  const [filterSeason, setFilterSeason] = useState('active');  // 'active' | 'intemporel' | seasonId | ''
  const [filterStyle, setFilterStyle] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [speeds, setSpeeds] = useState<Map<string, number>>(new Map());
  const [downloading, setDownloading] = useState<string | null>(null);
  const mediaEls = useRef<Map<string, HTMLAudioElement | HTMLVideoElement>>(new Map());

  const handleDownload = useCallback(async (m: { id: string; title: string; sourceUrl: string; type: string }) => {
    setDownloading(m.id);
    try {
      const res = await fetch(m.sourceUrl);
      const blob = await res.blob();
      const ext = m.type === 'video' ? 'mp4' : 'mp3';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${m.title}.${ext}`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* silencieux */ } finally {
      setDownloading(null);
    }
  }, []);

  const isAdminOrInstructor =
    account?.roles?.includes('admin') ||
    dancers.some(d => d.roles.includes('admin') || d.roles.includes('instructor'));

  useEffect(() => {
    if (!user) return;

    const now = new Date();

    // Vérifier trial actif
    const trialActive = dancers.some(d =>
      d.roles.includes('trial') &&
      d.trialExpiresAt &&
      (d.trialExpiresAt as any).toDate?.() > now
    );
    setHasActiveTrial(trialActive);

    Promise.all([
      getDocs(query(collection(db, 'media'), orderBy('uploadedAt', 'desc'))),
      getDocs(collection(db, 'seasons')),
      getDocs(collection(db, 'danceStyles')),
      getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
    ]).then(([mediaSnap, seasonSnap, styleSnap, membershipSnap]) => {
      setAllMedia(mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as Media)));

      const s = seasonSnap.docs.map(d => ({
        id: d.id,
        label: d.data().label ?? d.id,
        isActive: d.data().isActive === true,
      })).sort((a, b) => (b.label > a.label ? 1 : -1));
      setSeasons(s);

      setStyles(styleSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '', color: d.data().color })));

      const paid = membershipSnap.docs
        .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
        .map(d => d.data().seasonId as string)
        .filter(Boolean);
      setPaidSeasonIds([...new Set(paid)]);
    }).finally(() => setLoading(false));
  }, [user, dancers]);

  // Logique d'accès
  const canAccess = (m: Media): boolean => {
    if (isAdminOrInstructor) return true;
    if (hasActiveTrial) return true;
    if (!m.seasonId) return paidSeasonIds.length > 0;
    return paidSeasonIds.includes(m.seasonId);
  };

  const activeSeason = seasons.find(s => s.isActive);

  // Filtrage
  const visible = allMedia.filter(m => {
    if (!canAccess(m)) return false;
    if (filterType && m.type !== filterType) return false;
    if (filterStyle && m.danceStyleId !== filterStyle) return false;
    if (filterSeason === 'active') {
      return !m.seasonId || m.seasonId === activeSeason?.id;
    }
    if (filterSeason === 'intemporel') return !m.seasonId;
    if (filterSeason) return m.seasonId === filterSeason;
    return true;
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-gray-700 font-semibold mb-3">Connectez-vous pour accéder à la médiathèque.</p>
          <Link href="/login" className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-700">← Retour</button>
          <h1 className="text-2xl font-bold text-gray-900">Médiathèque</h1>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select value={filterType} onChange={e => setFilterType(e.target.value as '' | 'audio' | 'video')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white">
            <option value="">Tous types</option>
            <option value="audio">Audio</option>
            <option value="video">Vidéo</option>
          </select>
          <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white">
            <option value="active">Saison en cours + intemporels</option>
            <option value="">Toutes saisons</option>
            <option value="intemporel">Intemporels seulement</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {styles.length > 0 && (
            <select value={filterStyle} onChange={e => setFilterStyle(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white">
              <option value="">Tous styles</option>
              {styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-500 font-medium">Aucun média disponible.</p>
            {paidSeasonIds.length === 0 && !isAdminOrInstructor && !hasActiveTrial && (
              <p className="text-gray-400 text-sm mt-1">L'accès à la médiathèque requiert une cotisation active.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(m => (
              <div key={m.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${m.type === 'audio' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                    {m.type === 'audio' ? (
                      <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{m.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.type === 'audio' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {m.type === 'audio' ? 'Audio' : 'Vidéo'}
                      </span>
                      {m.durationSeconds && <span className="text-xs text-gray-400">{formatDuration(m.durationSeconds)}</span>}
                    </div>
                  </div>
                  <svg className={`w-5 h-5 text-gray-400 transition-transform shrink-0 ${expanded === m.id ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expanded === m.id && (
                  <div className="px-5 pb-5 border-t border-gray-50 pt-4">
                    {m.description && <p className="text-sm text-gray-600 mb-3">{m.description}</p>}
                    {m.type === 'audio' ? (
                      <audio controls crossOrigin="anonymous" src={m.sourceUrl} className="w-full"
                        ref={el => { if (el) mediaEls.current.set(m.id, el); else mediaEls.current.delete(m.id); }} />
                    ) : (
                      <video controls crossOrigin="anonymous" src={m.sourceUrl} className="w-full rounded-xl" style={{ maxHeight: 360 }}
                        ref={el => { if (el) mediaEls.current.set(m.id, el); else mediaEls.current.delete(m.id); }} />
                    )}
                    <div className="flex justify-end mt-3">
                      <button
                        onClick={() => handleDownload(m)}
                        disabled={downloading === m.id}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        {downloading === m.id ? 'Téléchargement…' : 'Télécharger'}
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-500 shrink-0">Vitesse</span>
                      <input type="range" min="0.5" max="2" step="0.01"
                        value={speeds.get(m.id) ?? 1}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          setSpeeds(prev => new Map(prev).set(m.id, val));
                          const el = mediaEls.current.get(m.id);
                          if (el) {
                            el.playbackRate = val;
                            (el as any).preservesPitch = true;
                            (el as any).webkitPreservesPitch = true;
                          }
                        }}
                        className="flex-1 accent-blue-600" />
                      <span className="text-xs text-gray-400 w-10 text-right">{Math.round((speeds.get(m.id) ?? 1) * 100)}%</span>
                      {(speeds.get(m.id) ?? 1) !== 1 && (
                        <button onClick={() => {
                          setSpeeds(prev => { const n = new Map(prev); n.delete(m.id); return n; });
                          const el = mediaEls.current.get(m.id);
                          if (el) el.playbackRate = 1;
                        }} className="text-xs text-gray-400 hover:text-gray-600">↺</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
