import type { FirestoreTimestamp } from './common';

export interface Payment {
  id: string;
  userId: string;
  amount: number;          // cents
  provider: 'manual';
  status: string;
  relatedMembershipId: string;
  createdAt: FirestoreTimestamp;
}
