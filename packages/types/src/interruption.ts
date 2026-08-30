export type InterruptionType = 'school_holiday' | 'manual';

export interface Interruption {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  type: InterruptionType;
  zone?: 'A' | 'B' | 'C';
  // Saison pour laquelle ces vacances scolaires ont ete importees (absent
  // sur les interruptions creees avant l'ajout du selecteur de saison).
  seasonId?: string;
}
