import type { WithTimestamps, FirestoreTimestamp } from './common';

export type DancerRole = 'member' | 'trial' | 'instructor' | 'bureau' | 'admin';

export interface Dancer extends WithTimestamps {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  firstNameLower: string;
  lastNameLower: string;
  birthDate?: FirestoreTimestamp;
  isMinor: boolean;
  photoUrl?: string;
  memberNumber?: string;
  phone?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  emergencyContact?: { name: string; phone: string };
  gender?: string;
  profession?: string;
  medicalNotes?: string;
  healthCertificate?: boolean;
  levelsByStyle?: Record<string, string>;
  roles: DancerRole[];
  trialStartDate?: FirestoreTimestamp;
  trialSessionsUsed?: number;
  trialExpiresAt?: FirestoreTimestamp;
  customFields?: Record<string, unknown>;
  notificationPreferences?: Record<string, boolean>;
  chatLastRead?: Record<string, number>;
  validatedSeasonIds?: string[];
  isActive: boolean;
  // Anonymisation suite à une demande de suppression de compte du danseur.
  isDeleted?: boolean;
  deletedAt?: FirestoreTimestamp;
  // Fiche incomplète détectée par un tiers (ex: cotisation payée par un
  // autre compte) qui n'avait pas les droits pour la compléter à sa place —
  // complétion à faire obligatoirement à la prochaine connexion du titulaire.
  profileCompletionRequired?: boolean;
  // Synchronisation contacts Google (voir functions/src/index.ts)
  googleContactResourceName?: string;
  googleContactGroupIds?: string[];
  // Danseur ayant demandé à être retiré des listes de diffusion Google.
  googleContactOptOut?: boolean;
}
