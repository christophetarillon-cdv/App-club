import type { FirestoreTimestamp } from './common';
import type { PaymentMethod } from './membership';

export type InstallmentStatus = 'pending' | 'paid' | 'late' | 'cancelled';

export interface PaymentInstallment {
  id: string;
  membershipId: string;
  userId: string;
  amount: number;          // cents
  method: PaymentMethod;
  expectedDate: string;    // ISO date string YYYY-MM-DD
  status: InstallmentStatus;
  chequeImageId?: string;
  bankDepositId?: string;
  transferReference?: string;
  notes?: string;
  actualDate?: string;
  paidAt?: FirestoreTimestamp;
}
