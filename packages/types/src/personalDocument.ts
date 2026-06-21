import type { FirestoreTimestamp } from './common';

export type PersonalDocumentType = 'receipt' | 'attestation' | 'invoice';

export interface PersonalDocument {
  id: string;
  userId: string;
  dancerId?: string;
  type: PersonalDocumentType;
  fileUrl: string;
  fileName: string;
  relatedId?: string;
  receiptNumber?: string;
  amount?: number;
  memberName?: string;
  seasonLabel?: string;
  generatedAt: FirestoreTimestamp;
}
