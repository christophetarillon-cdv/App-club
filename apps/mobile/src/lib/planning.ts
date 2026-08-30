import type { Course, Season, Interruption, FirestoreTimestamp } from '@cdv/types';

// Reproduit cote client la logique de generateSessions (functions/src/index.ts)
// pour decider si un cours recurrent s'applique a une date donnee, quand
// aucun doc `sessions` n'existe encore pour ce creneau (creneau "virtuel").
// Sans ca, l'ecran planning affichait des cours avant le debut de la saison
// ou pendant les vacances scolaires des qu'un vrai document sessions
// manquait pour cette date.

export interface PlanningRules {
  seasons: Map<string, Season>;
  interruptions: Interruption[];
  schoolZone: string;
  cancelOnPublicHolidays: boolean;
  cancelOnlyDuringSchoolHolidays: boolean;
  publicHolidayDates: Set<string>;
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timestampToDateStr(ts: FirestoreTimestamp): string {
  return toDateStr(ts.toDate());
}

export function courseAppliesOn(course: Course, date: Date, rules: PlanningRules): boolean {
  if (!course.isActive) return false;

  const dateStr = toDateStr(date);

  if (course.isOneOff) {
    return course.oneOffDate === dateStr;
  }

  if (date.getDay() !== course.dayOfWeek) return false;

  const season = rules.seasons.get(course.seasonId);
  if (!season) return false;
  const seasonStart = timestampToDateStr(season.startDate);
  const seasonEnd = timestampToDateStr(season.endDate);
  if (dateStr < seasonStart || dateStr > seasonEnd) return false;

  const isSchoolHoliday = rules.interruptions.some(i =>
    i.type === 'school_holiday' && i.zone === rules.schoolZone && dateStr >= i.startDate && dateStr <= i.endDate
  );
  const isInInterruption = rules.interruptions.some(i => {
    if (i.type === 'school_holiday' && i.zone !== rules.schoolZone) return false;
    return dateStr >= i.startDate && dateStr <= i.endDate;
  });

  if (isInInterruption) return false;
  if (rules.cancelOnPublicHolidays && rules.publicHolidayDates.has(dateStr)) {
    if (rules.cancelOnlyDuringSchoolHolidays) {
      if (isSchoolHoliday) return false;
    } else {
      return false;
    }
  }
  return true;
}
