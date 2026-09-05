import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// ── Tracing d'usage — événements volontairement peu nombreux et grossiers
// (pas de tap-par-tap) pour rester dans le forfait Firestore gratuit. Les
// documents bruts s'auto-suppriment via la politique TTL Firestore sur
// `expiresAt` (voir functions/src/index.ts, aggregateAnalyticsDaily) ; seuls
// les résumés quotidiens sont conservés durablement. Miroir de
// apps/mobile/src/lib/analytics.ts — mêmes types d'événements, platform:'web'.
export type AnalyticsEventType =
  | 'session_start'
  | 'screen_view'
  | 'membership_started'
  | 'membership_completed'
  | 'helloasso_payment_initiated'
  | 'media_played';

interface LogEventOptions {
  userId: string;
  dancerId?: string;
  screen?: string;
  mediaId?: string;
  mediaType?: 'audio' | 'video';
  danceStyleId?: string;
}

const RETENTION_DAYS = 90;

export function logEvent(type: AnalyticsEventType, opts: LogEventOptions) {
  const expiresAt = Timestamp.fromMillis(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
  addDoc(collection(db, 'analyticsEvents'), {
    type,
    platform: 'web',
    userId: opts.userId,
    dancerId: opts.dancerId ?? null,
    screen: opts.screen ?? null,
    mediaId: opts.mediaId ?? null,
    mediaType: opts.mediaType ?? null,
    danceStyleId: opts.danceStyleId ?? null,
    createdAt: serverTimestamp(),
    expiresAt,
  }).catch(() => { /* tracing best-effort : ne doit jamais faire echouer l'app */ });
}

// Pages "principales" suivies pour screen_view — liste courte, indexée par
// le premier segment du chemin (`/membership/payment-plan` → "membership").
export const TRACKED_PAGES: Record<string, string> = {
  membership: 'Cotisation',
  audio: 'Médiathèque audio',
  media: 'Médiathèque vidéo',
  chat: 'Chat',
  'my-card': 'Ma carte',
  trombinoscope: 'Trombinoscope',
  planning: 'Planning',
};

export function trackedScreenFromPathname(pathname: string): string | null {
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) return null;
  return TRACKED_PAGES[first] ?? null;
}
