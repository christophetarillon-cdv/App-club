export type SessionStatus = 'scheduled' | 'cancelled' | 'extra';

export interface Session {
  id: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  cancellationReason?: string;
}
