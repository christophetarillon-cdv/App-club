import type { FirestoreTimestamp } from './common';

export type MediaType = 'audio' | 'video';

export interface Media {
  id: string;
  title: string;
  description?: string;
  type: MediaType;
  seasonId?: string | null;
  storageProvider: 'firebase';
  storagePath: string;
  sourceUrl: string;
  uploadedBy: string;
  attachedTo?: string | null;   // 'course:{courseId}' ou 'session:{sessionId}' ou null
  courseId?: string | null;     // dénormalisé depuis attachedTo
  danceStyleId?: string | null; // dénormalisé depuis le cours
  // Rattachement à une séance précise (upload depuis la fiche détail d'une
  // séance) — dénormalisé pour retrouver/afficher la vidéo sans jointure.
  sessionId?: string | null;
  levelId?: string | null;
  sessionDate?: string | null;      // yyyy-mm-dd
  sessionStartTime?: string | null; // HH:mm
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  isPublic: boolean;
  uploadedAt: FirestoreTimestamp;
  encodingStatus?: 'pending' | 'encoding' | 'done' | 'error' | null;
}
