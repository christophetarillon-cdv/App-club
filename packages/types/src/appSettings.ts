import type { WithTimestamps } from './common';

export interface AppSettings extends WithTimestamps {
  trialMaxSessions: number;
  trialMaxDays: number;
  welcomeMessage?: string;
  welcomeSubMessage?: string;
  schoolZone?: 'A' | 'B' | 'C';
  cancelOnPublicHolidays?: boolean;
  cancelOnPublicHolidaysOnlyDuringSchoolHolidays?: boolean;
}
