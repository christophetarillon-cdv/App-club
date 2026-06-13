import type { FirestoreTimestamp } from './common';

export interface BankDeposit {
  id: string;
  depositDate: string;      // ISO date string YYYY-MM-DD
  bankAccount: string;
  installmentIds: string[];
  totalAmount: number;      // cents
  chequeCount: number;
  pdfUrl: string;           // Storage download URL
  generatedBy: string;      // admin uid
  createdAt: FirestoreTimestamp;
}
