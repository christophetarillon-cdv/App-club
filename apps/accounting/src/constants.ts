import { ChartOfAccount, BankAccount } from './types';

// Plan comptable simplifié pour associations
export const DEFAULT_CHART_OF_ACCOUNTS: Omit<ChartOfAccount, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // ACTIF
  { code: '51', label: 'Banque - Chèques', type: 'asset', parentCode: '5', isActive: true },
  { code: '52', label: 'Livrets/Épargne', type: 'asset', parentCode: '5', isActive: true },
  { code: '53', label: 'Caisse espèces', type: 'asset', parentCode: '5', isActive: true },
  { code: '54', label: 'PayPal/Stripe/Autres', type: 'asset', parentCode: '5', isActive: true },
  { code: '41', label: 'Créances adhérents', type: 'asset', isActive: true },

  // PASSIF
  { code: '30', label: 'Fonds d\'association', type: 'equity', isActive: true },

  // PRODUITS
  { code: '70', label: 'Cotisations adhérents', type: 'income', isActive: true },
  { code: '71', label: 'Cours (revenus)', type: 'income', isActive: true },
  { code: '72', label: 'Subventions', type: 'income', isActive: true },
  { code: '73', label: 'Autres revenus', type: 'income', isActive: true },

  // CHARGES
  { code: '60', label: 'Fournitures & matériel', type: 'expense', isActive: true },
  { code: '61', label: 'Transports & sorties', type: 'expense', isActive: true },
  { code: '62', label: 'Loyers & locaux', type: 'expense', isActive: true },
  { code: '63', label: 'Salaires/Intervenants', type: 'expense', isActive: true },
  { code: '64', label: 'Assurances & cotisations', type: 'expense', isActive: true },
  { code: '65', label: 'Services externes', type: 'expense', isActive: true },
  { code: '66', label: 'Autres charges', type: 'expense', isActive: true },
];

// Comptes bancaires par défaut (à adapter par club)
export const DEFAULT_BANK_ACCOUNTS: Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    code: 'CE_PRINCIPAL',
    label: 'Caisse Épargne Principale',
    type: 'checking',
    currency: 'EUR',
    isActive: true,
    sortOrder: 1,
  },
  {
    code: 'CE_LIVRET',
    label: 'Caisse Épargne - Livret',
    type: 'savings',
    currency: 'EUR',
    isActive: true,
    sortOrder: 2,
  },
  {
    code: 'PAYPAL',
    label: 'PayPal',
    type: 'online',
    currency: 'EUR',
    isActive: true,
    sortOrder: 3,
  },
  {
    code: 'STRIPE',
    label: 'Stripe',
    type: 'online',
    currency: 'EUR',
    isActive: true,
    sortOrder: 4,
  },
  {
    code: 'CAISSE',
    label: 'Caisse espèces',
    type: 'cash',
    currency: 'EUR',
    isActive: true,
    sortOrder: 5,
  },
];

// Catégories analytiques (anciennes - conservées pour compatibilité)
export const ANALYTICS_CATEGORIES = {
  adhesions: { label: 'Adhésions', type: 'income' as const },
  courses: { label: 'Cours', type: 'income' as const },
  subvention_mairie: { label: 'Subvention Mairie', type: 'income' as const },
  subvention_region: { label: 'Subvention Région', type: 'income' as const },
  subvention_europe: { label: 'Subvention Europe', type: 'income' as const },
  location: { label: 'Location/Loyers', type: 'expense' as const },
  salaires: { label: 'Salaires/Intervenants', type: 'expense' as const },
  fournitures: { label: 'Fournitures', type: 'expense' as const },
  assurances: { label: 'Assurances', type: 'expense' as const },
  autre: { label: 'Autre', type: 'income' as const },
} as const;

// Catégories analytiques par défaut (nouvelles - paramétrables)
export const DEFAULT_ANALYTICS_CATEGORIES = [
  {
    name: 'Soirées & Événements',
    description: 'Dépenses liées aux soirées et événements',
    accountCodes: ['60', '61', '62'],
    color: '#FF6B6B',
    sortOrder: 1,
  },
  {
    name: 'Formation & Cours',
    description: 'Revenus et dépenses de formation',
    accountCodes: ['71', '65'],
    color: '#4ECDC4',
    sortOrder: 2,
  },
  {
    name: 'Adhésions & Cotisations',
    description: 'Revenus des adhésions',
    accountCodes: ['70'],
    color: '#45B7D1',
    sortOrder: 3,
  },
  {
    name: 'Subventions',
    description: 'Revenus de subventions publiques',
    accountCodes: ['72'],
    color: '#96CEB4',
    sortOrder: 4,
  },
  {
    name: 'Fonctionnement',
    description: 'Charges de fonctionnement courant',
    accountCodes: ['64', '65', '66'],
    color: '#FFEAA7',
    sortOrder: 5,
  },
] as const;
