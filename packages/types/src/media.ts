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
  attachedTo?: string | null;   // 'course:{courseId}' ou null
  courseId?: string | null;     // dénormalisé depuis attachedTo
  danceStyleId?: string | null; // dénormalisé depuis le cours
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  isPublic: boolean;
  uploadedAt: FirestoreTimestamp;
  encodingStatus?: 'pending' | 'encoding' | 'done' | 'error' | null;
}
