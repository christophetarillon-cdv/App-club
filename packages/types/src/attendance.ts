import type { Timestamp } from 'firebase/firestore';

export interface Attendance {
  id: string;
  dancerId: string;
  sessionId?: string;
  date: string; // YYYY-MM-DD
  scannedAt: Timestamp;
  method: 'qr' | 'manual';
}
