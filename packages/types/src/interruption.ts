export type InterruptionType = 'school_holiday' | 'manual';

export interface Interruption {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  type: InterruptionType;
  zone?: 'A' | 'B' | 'C';
}
