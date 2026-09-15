import type { WithTimestamps, FirestoreTimestamp } from './common';

export type PaymentMethod = 'cheque' | 'transfer' | 'cash' | 'helloasso' | 'free' | 'mixed';
export type PaymentPlanStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type MembershipStatus = 'pending' | 'active' | 'complete';
export type RefundMethod = 'cheque' | 'transfer' | 'cash';

export interface Membership extends WithTimestamps {
  id: string;
  userId: string;
  // Comptes autorisés à LIRE ce document en plus de `userId` — nécessaire
  // quand le payeur règle la cotisation d'un danseur d'un autre compte
  // ("Moi + danseurs d'un autre compte") : sans ça, le titulaire du danseur
  // ne peut jamais voir sa propre cotisation depuis son compte (règles
  // Firestore scopées sur `userId`). Absent sur les documents créés avant
  // ce correctif (pas de migration des données historiques).
  visibleUserIds?: string[];
  seasonId: string;
  pricingPlanId: string;
  totalDue: number;        // cents
  totalPaid: number;       // cents
  paymentMethod: PaymentMethod;
  paymentPlanStatus: PaymentPlanStatus;
  installmentIds: string[];
  status: MembershipStatus;
  // Identité figée à la création — une pièce comptable doit rester lisible
  // après anonymisation du compte ou de la fiche danseur. Optionnels car
  // absents des cotisations créées avant la mise en place (pas de migration
  // des données historiques : celles-ci sont couvertes par accountingIdentities).
  payerEmail?: string;
  payerName?: string;
  dancerName?: string;
  paidAt?: FirestoreTimestamp;
  // Annulation en cours de saison
  cancelledAt?: FirestoreTimestamp;
  cancelledBy?: string;
  cancellationReason?: string;
  refundAmount?: number;      // cents
  refundMethod?: RefundMethod;
  refundReference?: string;
}
