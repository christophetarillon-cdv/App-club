import type { WithTimestamps } from './common';

export type ProfileFieldKey =
  | 'phone'
  | 'address'
  | 'birthDate'
  | 'isMinor'
  | 'photoUrl'
  | 'memberNumber'
  | 'emergencyContact'
  | 'levelsByStyle'
  | 'gender'
  | 'profession'
  | 'medicalNotes'
  | 'healthCertificate'
  | 'marketingConsent'
  | 'imageRightsConsent';

export interface ProfileFieldConfig {
  enabled: boolean;
  required: boolean;
  lockedByDefault?: boolean;
}

export type ProfileFieldsConfig = Partial<Record<ProfileFieldKey, ProfileFieldConfig>>;

export const DEFAULT_PROFILE_FIELDS: Record<ProfileFieldKey, ProfileFieldConfig> = {
  phone: { enabled: true, required: false },
  address: { enabled: true, required: false },
  birthDate: { enabled: true, required: false },
  isMinor: { enabled: true, required: false },
  photoUrl: { enabled: true, required: false },
  memberNumber: { enabled: true, required: false, lockedByDefault: true },
  emergencyContact: { enabled: true, required: false },
  levelsByStyle: { enabled: true, required: false, lockedByDefault: true },
  gender: { enabled: false, required: false },
  profession: { enabled: false, required: false },
  medicalNotes: { enabled: false, required: false },
  healthCertificate: { enabled: false, required: false },
  marketingConsent: { enabled: false, required: false },
  imageRightsConsent: { enabled: false, required: false },
};

export interface AppSettings extends WithTimestamps {
  trialMaxSessions: number;
  trialMaxDays: number;
  welcomeMessage?: string;
  welcomeSubMessage?: string;
  schoolZone?: 'A' | 'B' | 'C';
  cancelOnPublicHolidays?: boolean;
  cancelOnPublicHolidaysOnlyDuringSchoolHolidays?: boolean;
  profileFields?: ProfileFieldsConfig;
}
