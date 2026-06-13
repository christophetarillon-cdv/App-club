import type { WithTimestamps, FirestoreTimestamp } from './common';

export type PaymentMethod = 'cheque' | 'transfer' | 'cash';
export type PaymentPlanStatus = 'pending' | 'approved' | 'rejected';
export type MembershipStatus = 'pending' | 'active' | 'complete';

export interface Membership extends WithTimestamps {
  id: string;
  userId: string;
  seasonId: string;
  pricingPlanId: string;
  totalDue: number;        // cents
  totalPaid: number;       // cents
  paymentMethod: PaymentMethod;
  paymentPlanStatus: PaymentPlanStatus;
  installmentIds: string[];
  status: MembershipStatus;
  paidAt?: FirestoreTimestamp;
}
