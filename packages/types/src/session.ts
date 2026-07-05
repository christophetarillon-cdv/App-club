export type SessionStatus = 'scheduled' | 'cancelled' | 'extra';

export interface Session {
  id: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  cancellationReason?: string;
  actualAttendees?: number;
  // Note de programme du jour (change à chaque séance) — éditable par les
  // rôles configurés dans appSettings.sessionNoteEditRoles.
  programNote?: string;
}
