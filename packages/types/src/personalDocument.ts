import type { FirestoreTimestamp } from './common';

export type PersonalDocumentType = 'receipt' | 'attestation' | 'invoice' | 'cancellation';

export interface PersonalDocument {
  id: string;
  userId: string;
  // Voir Membership.visibleUserIds — même mécanisme : un reçu/attestation
  // généré pour une cotisation payée par un autre compte doit rester
  // consultable par le compte du danseur concerné.
  visibleUserIds?: string[];
  dancerId?: string;
  type: PersonalDocumentType;
  fileUrl: string;
  fileName: string;
  relatedId?: string;
  receiptNumber?: string;
  amount?: number;
  refundAmount?: number;
  memberName?: string;
  seasonLabel?: string;
  generatedAt: FirestoreTimestamp;
}
