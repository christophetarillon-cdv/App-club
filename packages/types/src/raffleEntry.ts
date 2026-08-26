import type { FirestoreTimestamp } from './common';

export interface RaffleEntry {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  isDancer: boolean;
  createdAt: FirestoreTimestamp;
  hasWon: boolean;
  wonAt?: FirestoreTimestamp;
  winnerCode?: string;
}
