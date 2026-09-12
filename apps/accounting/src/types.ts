// Plan comptable et types métier

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type TransactionType = 'deposit' | 'withdrawal';
export type EntryStatus = 'draft' | 'posted';
export type ReconciliationStatus = 'draft' | 'validated' | 'partial';

// Compte comptable (plan comptable)
export interface ChartOfAccount {
  id: string;
  code: string; // "51", "70", etc.
  label: string; // "Banque", "Cotisations", etc.
  type: AccountType;
  parentCode?: string; // Pour hiérarchie (ex: "70" > "701")
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// Compte bancaire/caisse (pratique)
export interface BankAccount {
  id: string;
  code: string; // "CE_PRINCIPAL", "PAYPAL", "CAISSE"
  label: string; // "Caisse Épargne Principale"
  type: 'checking' | 'savings' | 'cash' | 'online';
  iban?: string;
  currency: 'EUR' | 'USD';
  isActive: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

// Écriture comptable
export interface AccountingEntry {
  id: string;
  seasonId: string; // "2024-2025"
  date: number; // timestamp
  description: string;

  // Comptabilité formelle (débit/crédit)
  debit: {
    accountCode: string; // "51" = Banque
    amount: number;
  };
  credit: {
    accountCode: string; // "70" = Cotisations
    amount: number;
  };

  // Suivi pratique par compte bancaire
  bankAccount: string; // "CE_PRINCIPAL"
  transactionType: TransactionType; // "deposit" ou "withdrawal"

  // Catégorisation analytique
  category: 'adhesions' | 'courses' | 'subvention_mairie' | 'subvention_region'
    | 'subvention_europe' | 'location' | 'salaires' | 'fournitures'
    | 'assurances' | 'autre';
  tags?: string[]; // ["2024-2025", "enfants", "payé"]

  // Rapprochement bancaire
  reconciled: boolean;
  reconciliedAt?: number;
  bankStatementRef?: string; // Référence à l'extrait bancaire

  // Justificatif
  documentId?: string; // Lien vers facture/reçu
  relatedPaymentId?: string; // Lien vers paiement CDCV si auto-créée

  status: EntryStatus;
  notes?: string;

  createdAt: number;
  updatedAt: number;
  createdBy: string; // uid
  updatedBy?: string;
}

// Extrait bancaire importé
export interface BankStatement {
  id: string;
  seasonId: string;
  accountId: string; // "CE_PRINCIPAL"
  month: string; // "2024-09"
  fileName: string;

  // Infos officielles du relevé
  bankBalance: number; // Solde selon la banque
  bankStatementDate: number; // Date du relevé

  // Import brut
  entries: {
    date: string;
    description: string;
    amount: number; // Positif = crédit, négatif = débit
    balance?: number;
  }[];

  status: 'imported' | 'reconciling' | 'reconciled';
  reconciliedAt?: number;
  notes?: string;

  createdAt: number;
  uploadedBy: string;
}

// Rapprochement bancaire
export interface BankReconciliation {
  id: string;
  seasonId: string;
  accountId: string; // "CE_PRINCIPAL"
  month: string; // "2024-09"

  bankBalance: number; // Solde officiel du relevé
  calculatedBalance: number; // Votre solde (somme des écritures pointées)
  difference: number; // bankBalance - calculatedBalance

  // Transactions non pointées (écarts à résoudre)
  unreconciledEntries: {
    entryId: string;
    date: number;
    description: string;
    amount: number;
    days_outstanding: number; // Jours depuis transaction
  }[];

  reconciliedEntries: string[]; // IDs des écritures pointées

  status: ReconciliationStatus;

  // Notes pour le trésorier
  notes?: string;
  validatedAt?: number;
  validatedBy?: string;

  createdAt: number;
  updatedAt: number;
}

// Ventilation par catégorie (tableau de bord)
export interface VentilationSummary {
  id: string;
  seasonId: string;
  period: string; // "2024-09" (mois) ou "2024-2025" (saison)

  byCategory: {
    [category: string]: {
      revenue?: number;
      expense?: number;
      count: number;
      entries?: string[]; // IDs des écritures
    };
  };

  byBankAccount: {
    [accountId: string]: {
      debit: number;
      credit: number;
      balance: number;
    };
  };

  totals: {
    totalRevenue: number;
    totalExpense: number;
    netResult: number;
  };

  calculatedAt: number;
}

// Balance simpifiée (pour bilan)
export interface BalanceSheet {
  id: string;
  seasonId: string;
  asOf: number; // timestamp

  byAccount: {
    [accountCode: string]: {
      label: string;
      type: AccountType;
      debit: number;
      credit: number;
      balance: number; // debit - credit
    };
  };

  totals: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    netResult: number; // Résultat de l'exercice
  };

  calculatedAt: number;
}

// Catégorie analytique (pour ventilation)
export interface AnalyticsCategory {
  id: string;
  seasonId: string;
  name: string; // "Soirées", "Formation", "Fonctionnement"
  description?: string;
  accountCodes: string[]; // ["60", "61", "62"]
  color?: string; // Optionnel : couleur pour affichage
  sortOrder: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// Document justificatif (facture, reçu, etc.)
export interface AccountingDocument {
  id: string;
  seasonId: string;
  entryId?: string; // Lien à l'écriture
  type: 'invoice' | 'receipt' | 'bank_statement' | 'proof';

  description: string;
  fileName: string;
  fileUrl: string; // gs:// ou dropbox link
  fileSize: number;
  mimeType: string;

  relatedPaymentId?: string;
  amount?: number;
  date?: number;

  uploadedAt: number;
  uploadedBy: string;
  archived: boolean;
}
