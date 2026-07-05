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
}
