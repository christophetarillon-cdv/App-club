'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface DailySummary {
  date: string;
  counts: {
    session_start: { total: number; ios: number; android: number; web: number };
    screen_view: { total: number; byScreen: Record<string, number> };
    membership_started: number;
    membership_completed: number;
    helloasso_payment_initiated: number;
    media_played: { total: number; byType: { audio: number; video: number }; byMediaId: Record<string, number> };
  };
  uniqueUsers: number;
  rawEventCount: number;
}

const RANGE_DAYS = 30;

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700 w-40 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
        <div className="h-2.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-sm font-semibold text-gray-900 w-10 text-right shrink-0">{value}</span>
    </div>
  );
}

interface MediaInfo { title: string; type: 'audio' | 'video' | null; }

export default function AdminAnalyticsPage() {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [mediaInfo, setMediaInfo] = useState<Record<string, MediaInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, 'analyticsDailySummaries'), orderBy('date', 'desc'), limit(RANGE_DAYS)));
      const data = snap.docs.map(d => d.data() as DailySummary);
      setSummaries(data);

      const mediaIds = new Set<string>();
      data.forEach(d => {
        Object.keys(d.counts.media_played?.byMediaId ?? {}).forEach(id => mediaIds.add(id));
      });
      if (mediaIds.size > 0) {
        const entries = await Promise.all(
          [...mediaIds].map(async (id): Promise<readonly [string, MediaInfo]> => {
            const mSnap = await getDoc(doc(db, 'media', id));
            const d = mSnap.data();
            return [id, mSnap.exists()
              ? { title: (d?.title as string) ?? id, type: (d?.type as 'audio' | 'video' | undefined) ?? null }
              : { title: `(supprimé) ${id}`, type: null }] as const;
          })
        );
        setMediaInfo(Object.fromEntries(entries));
      }

      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Chargement…</p>;

  if (summaries.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Utilisation de l'app</h1>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">
          Aucune donnée pour l'instant — le premier résumé arrivera après la première nuit de collecte.
        </div>
      </div>
    );
  }

  const totalSessions = summaries.reduce((s, d) => s + d.counts.session_start.total, 0);
  const totalIos = summaries.reduce((s, d) => s + d.counts.session_start.ios, 0);
  const totalAndroid = summaries.reduce((s, d) => s + d.counts.session_start.android, 0);
  const totalWeb = summaries.reduce((s, d) => s + d.counts.session_start.web, 0);
  const avgDailyUsers = Math.round(summaries.reduce((s, d) => s + d.uniqueUsers, 0) / summaries.length);

  const membershipStarted = summaries.reduce((s, d) => s + d.counts.membership_started, 0);
  const membershipCompleted = summaries.reduce((s, d) => s + d.counts.membership_completed, 0);
  const completionRate = membershipStarted > 0 ? Math.round((membershipCompleted / membershipStarted) * 100) : null;

  const screenTotals: Record<string, number> = {};
  summaries.forEach(d => {
    for (const [screen, count] of Object.entries(d.counts.screen_view.byScreen)) {
      screenTotals[screen] = (screenTotals[screen] ?? 0) + count;
    }
  });
  const topScreens = Object.entries(screenTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxScreen = topScreens[0]?.[1] ?? 0;

  const audioTotals: Record<string, number> = {};
  const videoTotals: Record<string, number> = {};
  summaries.forEach(d => {
    for (const [mediaId, count] of Object.entries(d.counts.media_played.byMediaId)) {
      const type = mediaInfo[mediaId]?.type;
      if (type === 'audio') audioTotals[mediaId] = (audioTotals[mediaId] ?? 0) + count;
      else if (type === 'video') videoTotals[mediaId] = (videoTotals[mediaId] ?? 0) + count;
    }
  });
  const topAudio = Object.entries(audioTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topVideo = Object.entries(videoTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxAudio = topAudio[0]?.[1] ?? 0;
  const maxVideo = topVideo[0]?.[1] ?? 0;
  const audioPlays = summaries.reduce((s, d) => s + d.counts.media_played.byType.audio, 0);
  const videoPlays = summaries.reduce((s, d) => s + d.counts.media_played.byType.video, 0);

  const helloassoInitiated = summaries.reduce((s, d) => s + d.counts.helloasso_payment_initiated, 0);

  const maxDailySessions = Math.max(...summaries.map(d => d.counts.session_start.total), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Utilisation de l'app</h1>
        <span className="text-xs text-gray-400">{summaries.length} derniers jours avec données</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Résumés agrégés uniquement — aucun événement individuel n'est affiché ici.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Tile label="Sessions" value={totalSessions} sub={`iOS ${totalIos} · Android ${totalAndroid} · Web ${totalWeb}`} />
        <Tile label="Utilisateurs actifs / jour" value={avgDailyUsers} sub="moyenne sur la période" />
        <Tile label="Cotisations démarrées → finalisées"
          value={completionRate !== null ? `${completionRate}%` : '—'}
          sub={`${membershipCompleted} / ${membershipStarted}`} />
        <Tile label="Paiements CB lancés" value={helloassoInitiated} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Écrans les plus utilisés</h2>
          {topScreens.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune donnée.</p>
          ) : (
            <div className="space-y-3">
              {topScreens.map(([screen, count]) => (
                <Bar key={screen} label={screen} value={count} max={maxScreen} color="#2563EB" />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Audios les plus écoutés</h2>
            <span className="text-xs text-gray-400">{audioPlays} lecture{audioPlays > 1 ? 's' : ''}</span>
          </div>
          {topAudio.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune donnée.</p>
          ) : (
            <div className="space-y-3">
              {topAudio.map(([mediaId, count]) => (
                <Bar key={mediaId} label={mediaInfo[mediaId]?.title ?? mediaId} value={count} max={maxAudio} color="#7C3AED" />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Vidéos les plus regardées</h2>
            <span className="text-xs text-gray-400">{videoPlays} lecture{videoPlays > 1 ? 's' : ''}</span>
          </div>
          {topVideo.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune donnée.</p>
          ) : (
            <div className="space-y-3">
              {topVideo.map(([mediaId, count]) => (
                <Bar key={mediaId} label={mediaInfo[mediaId]?.title ?? mediaId} value={count} max={maxVideo} color="#EA580C" />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Sessions par jour</h2>
          <div className="flex items-end gap-1 h-28">
            {[...summaries].reverse().map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.date} : ${d.counts.session_start.total}`}>
                <div className="w-full bg-blue-500 rounded-t"
                  style={{ height: `${Math.max(4, (d.counts.session_start.total / maxDailySessions) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-2">
            <span>{[...summaries].reverse()[0]?.date}</span>
            <span>{summaries[0]?.date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
