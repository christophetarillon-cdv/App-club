import type { FirestoreTimestamp } from './common';

export interface RaffleWinnerCode {
  code: string; // = id du document
  raffleEntryId: string;
  redeemed: boolean;
  createdAt: FirestoreTimestamp;
  redeemedAt?: FirestoreTimestamp;
  redeemedMembershipId?: string;
}
