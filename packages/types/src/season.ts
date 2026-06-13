import type { WithTimestamps, FirestoreTimestamp } from './common';

export interface Season extends WithTimestamps {
  id: string;
  label: string;
  startDate: FirestoreTimestamp;
  endDate: FirestoreTimestamp;
  isActive: boolean;
  registrationOpen: boolean;
}
