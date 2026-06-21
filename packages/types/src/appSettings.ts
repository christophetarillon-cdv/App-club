import type { WithTimestamps } from './common';

export type ProfileFieldKey =
  | 'firstName' | 'lastName' | 'email'
  | 'birthDate' | 'gender' | 'phone'
  | 'address' | 'emergencyContact' | 'photo'
  | 'profession' | 'medicalNotes' | 'healthCertificate'
  | 'marketingConsent' | 'imageRightsConsent';

export interface ProfileFieldConfig {
  enabled: boolean;
  required: boolean;
  lockedByDefault?: boolean;
}

export type ProfileFieldsConfig = Record<ProfileFieldKey, ProfileFieldConfig>;

export const DEFAULT_PROFILE_FIELDS: ProfileFieldsConfig = {
  firstName:          { enabled: true,  required: true,  lockedByDefault: true },
  lastName:           { enabled: true,  required: true,  lockedByDefault: true },
  email:              { enabled: true,  required: true,  lockedByDefault: true },
  birthDate:          { enabled: true,  required: false },
  gender:             { enabled: false, required: false },
  phone:              { enabled: true,  required: true },
  address:            { enabled: true,  required: false },
  emergencyContact:   { enabled: true,  required: false },
  photo:              { enabled: true,  required: false },
  profession:         { enabled: false, required: false },
  medicalNotes:       { enabled: false, required: false },
  healthCertificate:  { enabled: false, required: false },
  marketingConsent:   { enabled: true,  required: false },
  imageRightsConsent: { enabled: true,  required: false },
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
