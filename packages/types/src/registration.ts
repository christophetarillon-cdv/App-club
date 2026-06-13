export type RegistrationStatus = 'active' | 'cancelled' | 'waitlist';

export interface Registration {
  id: string;
  userId: string;
  courseId: string;
  seasonId: string;
  registeredAt: string;
  status: RegistrationStatus;
}
