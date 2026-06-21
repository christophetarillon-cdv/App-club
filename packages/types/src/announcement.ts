import type { FirestoreTimestamp } from './common';

export interface Announcement {
  id: string;
  channelId: string;
  title: string;
  body: string;
  sentAt: FirestoreTimestamp;
  sentBy: string;
  recipientCount: number;
}
