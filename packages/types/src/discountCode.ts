import type { FirestoreTimestamp } from './common';

export interface DiscountCodeRedemption {
  dancerId: string;
  membershipId: string;
  redeemedAt: FirestoreTimestamp;
}

export interface DiscountCode {
  code: string; // = id du document
  seasonId: string;
  discountAmount: number; // centimes
  maxUses: number;
  usesCount: number;
  allowedDancerIds: string[]; // vide = utilisable par n'importe quel danseur
  active: boolean;
  label?: string; // note libre pour l'admin (ex: "Réduction fratrie Dupont")
  redemptions: DiscountCodeRedemption[];
  createdAt: FirestoreTimestamp;
  createdBy: string;
  updatedAt?: FirestoreTimestamp;
}
