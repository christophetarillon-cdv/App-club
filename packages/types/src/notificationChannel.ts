import type { FirestoreTimestamp } from './common';

export type NotificationChannelType = 'main' | 'course' | 'style' | 'custom';

export interface NotificationChannel {
  id: string;
  name: string;
  type: NotificationChannelType;
  targetId?: string | null;
  customMemberIds?: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: FirestoreTimestamp;
}
