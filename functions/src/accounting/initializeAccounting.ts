import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const getDb = () => admin.firestore();

// Plan comptable par défaut
const DEFAULT_CHART_OF_ACCOUNTS = [
  { code: '51', label: 'Banque - Chèques', type: 'asset', isActive: true },
  { code: '52', label: 'Livrets/Épargne', type: 'asset', isActive: true },
  { code: '53', label: 'Caisse espèces', type: 'asset', isActive: true },
  { code: '54', label: 'PayPal/Stripe/Autres', type: 'asset', isActive: true },
  { code: '41', label: 'Créances adhérents', type: 'asset', isActive: true },
  { code: '30', label: 'Fonds d\'association', type: 'equity', isActive: true },
  { code: '70', label: 'Cotisations adhérents', type: 'income', isActive: true },
  { code: '71', label: 'Cours (revenus)', type: 'income', isActive: true },
  { code: '72', label: 'Subventions', type: 'income', isActive: true },
  { code: '73', label: 'Autres revenus', type: 'income', isActive: true },
  { code: '60', label: 'Fournitures & matériel', type: 'expense', isActive: true },
  { code: '61', label: 'Transports & sorties', type: 'expense', isActive: true },
  { code: '62', label: 'Loyers & locaux', type: 'expense', isActive: true },
  { code: '63', label: 'Salaires/Intervenants', type: 'expense', isActive: true },
  { code: '64', label: 'Assurances & cotisations', type: 'expense', isActive: true },
  { code: '65', label: 'Services externes', type: 'expense', isActive: true },
  { code: '66', label: 'Autres charges', type: 'expense', isActive: true },
];

const DEFAULT_BANK_ACCOUNTS = [
  { code: 'CE_PRINCIPAL', label: 'Caisse Épargne Principale', type: 'checking', currency: 'EUR', isActive: true, sortOrder: 1 },
  { code: 'CE_LIVRET', label: 'Caisse Épargne - Livret', type: 'savings', currency: 'EUR', isActive: true, sortOrder: 2 },
  { code: 'PAYPAL', label: 'PayPal', type: 'online', currency: 'EUR', isActive: true, sortOrder: 3 },
  { code: 'STRIPE', label: 'Stripe', type: 'online', currency: 'EUR', isActive: true, sortOrder: 4 },
  { code: 'CAISSE', label: 'Caisse espèces', type: 'cash', currency: 'EUR', isActive: true, sortOrder: 5 },
];

// Déclenché manuellement pour initialiser la comptabilité d'un club
export const initializeAccounting = onCall(
  { region: 'europe-west3' },
  async (request) => {
    // Autorisation : admin uniquement
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const uid = request.auth.uid;
    const accountSnap = await getDb().collection('accounts').doc(uid).get();
    const account = accountSnap.data();

    if (!account?.roles?.includes('admin')) {
      throw new HttpsError('permission-denied', 'Only admins can initialize accounting');
    }

    try {
      // 1. Crée le plan comptable par défaut s'il n'existe pas
      const chartSnap = await getDb().collection('chartOfAccounts').get();

      if (chartSnap.empty) {
        const batch = getDb().batch();

        DEFAULT_CHART_OF_ACCOUNTS.forEach((account, idx) => {
          const id = `account_${account.code}`;
          batch.set(getDb().collection('chartOfAccounts').doc(id), {
            ...account,
            id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        });

        await batch.commit();
        console.log(`[Accounting] Created ${DEFAULT_CHART_OF_ACCOUNTS.length} chart of accounts`);
      }

      // 2. Crée les comptes bancaires par défaut s'ils n'existent pas
      const bankSnap = await getDb().collection('bankAccounts').get();

      if (bankSnap.empty) {
        const batch = getDb().batch();

        DEFAULT_BANK_ACCOUNTS.forEach((account) => {
          const id = account.code.toLowerCase();
          batch.set(getDb().collection('bankAccounts').doc(id), {
            ...account,
            id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        });

        await batch.commit();
        console.log(`[Accounting] Created ${DEFAULT_BANK_ACCOUNTS.length} bank accounts`);
      }

      return {
        success: true,
        message: 'Accounting initialized successfully',
      };
    } catch (error) {
      console.error('[Accounting] Error initializing accounting:', error);
      throw new HttpsError('internal', 'Failed to initialize accounting');
    }
  }
);
