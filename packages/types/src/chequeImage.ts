import type { FirestoreTimestamp } from './common';

export type OcrConfidence = 'high' | 'medium' | 'low';

export interface ChequeImage {
  id: string;
  installmentId?: string;
  storagePath: string;      // cheques/{id}
  uploadedBy: string;       // admin uid
  uploadedAt: FirestoreTimestamp;
  // OCR fields (written by Cloud Function)
  cmc7?: string;
  amountFromOcr?: number;   // cents
  amountConfidence?: OcrConfidence;
  ocrRawText?: string;
  ocrProcessedAt?: FirestoreTimestamp;
  // Validation fields (written by admin)
  validatedAmount?: number; // cents
  validatedBy?: string;
  validatedAt?: FirestoreTimestamp;
  // Lifecycle
  scheduledDeletionAt?: FirestoreTimestamp;
}
