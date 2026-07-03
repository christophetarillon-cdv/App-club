import type { WithTimestamps, FirestoreTimestamp } from './common';

export type PaymentMethod = 'cheque' | 'transfer' | 'cash';
export type PaymentPlanStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type MembershipStatus = 'pending' | 'active' | 'complete';
export type RefundMethod = 'cheque' | 'transfer' | 'cash';

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
  // Annulation en cours de saison
  cancelledAt?: FirestoreTimestamp;
  cancelledBy?: string;
  cancellationReason?: string;
  refundAmount?: number;      // cents
  refundMethod?: RefundMethod;
  refundReference?: string;
}
