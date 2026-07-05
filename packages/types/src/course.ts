export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Course {
  id: string;
  name: string;
  danceStyleId: string;
  levelId: string;
  roomId: string;
  seasonId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  instructorId?: string;
  maxParticipants?: number;
  isActive: boolean;
  // Séance ponctuelle (pas de récurrence hebdomadaire sur la saison) : une
  // seule session générée, à oneOffDate, au lieu d'une par semaine.
  isOneOff?: boolean;
  oneOffDate?: string; // yyyy-mm-dd, requis si isOneOff
}
