import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from './firebase';

// ── Tracing d'usage — événements volontairement peu nombreux et grossiers
// (pas de tap-par-tap) pour rester dans le forfait Firestore gratuit. Les
// documents bruts s'auto-suppriment via la politique TTL Firestore sur
// `expiresAt` (voir functions/src/index.ts, aggregateAnalyticsDaily) ; seuls
// les résumés quotidiens sont conservés durablement.
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
    platform: Platform.OS,
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

// Écrans "principaux" suivis pour screen_view — volontairement une liste
// courte (pas chaque sous-écran/modale) : on veut savoir quelles grandes
// fonctionnalités sont utilisées, pas retracer chaque clic. Indexé par le
// dernier segment du chemin (`/dancer/[id]/home` → "home") pour rester
// indépendant de la résolution exacte des routes dynamiques par expo-router.
export const TRACKED_SCREENS: Record<string, string> = {
  home: 'Accueil',
  planning: 'Planning',
  membership: 'Cotisation',
  audios: 'Médiathèque audio',
  videos: 'Médiathèque vidéo',
  chat: 'Chat',
  card: 'Ma carte',
  trombinoscope: 'Trombinoscope',
};

export function trackedScreenFromPathname(pathname: string): string | null {
  const last = pathname.split('/').filter(Boolean).pop();
  if (!last) return null;
  return TRACKED_SCREENS[last] ?? null;
}
