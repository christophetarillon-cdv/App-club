import type { FirestoreTimestamp } from './common';

export type KioskSessionStatus = 'active' | 'closed';

export interface KioskSession {
  id: string;
  sessionId: string;
  courseId: string;
  openedAt: FirestoreTimestamp;
  closedAt?: FirestoreTimestamp;
  openedBy: string; // dancerId (admin ou moniteur)
  status: KioskSessionStatus;
  lastActivityAt?: FirestoreTimestamp;
}
