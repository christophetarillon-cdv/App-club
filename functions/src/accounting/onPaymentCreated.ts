import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

const getDb = () => admin.firestore();

// Déclenché quand un paiement est créé (cotisation, cours, etc.)
export const onPaymentCreated = onDocumentCreated(
  { region: 'europe-west3', document: 'payments/{paymentId}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const payment = snap.data();
    const paymentId = event.params.paymentId;

    try {
      // Création automatique de l'écriture comptable
      const entry: any = {
        seasonId: payment.seasonId,
        date: Date.now(),
        description: `Paiement - ${payment.category || 'Paiement'}`,

        debit: {
          accountCode: getBankAccountCode(payment.bankAccount || 'CE_PRINCIPAL'),
          amount: payment.amount,
        },
        credit: {
          accountCode: getCategoryAccountCode(payment.category),
          amount: payment.amount,
        },

        bankAccount: payment.bankAccount || 'CE_PRINCIPAL',
        transactionType: 'deposit',
        category: mapPaymentCategoryToAccounting(payment.category),
        tags: [payment.seasonId],

        reconciled: false,
        relatedPaymentId: paymentId,
        status: 'posted',

        createdAt: Date.now(),
        createdBy: 'system-payment',
      };

      // Sauvegarde
      await getDb().collection('accountingEntries').add(entry);

      console.log(`[Accounting] Created entry for payment ${paymentId}`);
    } catch (error) {
      console.error(`[Accounting] Error creating entry for payment ${paymentId}:`, error);
      throw error;
    }
  }
);

// Mappage compte bancaire → code comptable
function getBankAccountCode(bankAccountId: string): string {
  const mapping: Record<string, string> = {
    CE_PRINCIPAL: '51',
    CE_LIVRET: '52',
    PAYPAL: '54',
    STRIPE: '54',
    CAISSE: '53',
  };
  return mapping[bankAccountId] || '51';
}

// Mappage catégorie de paiement → code comptable
function getCategoryAccountCode(category: string): string {
  const mapping: Record<string, string> = {
    adhesion: '70',
    cotisation: '70',
    cours: '71',
    subvention: '72',
    autre: '73',
  };
  return mapping[category] || '73';
}

// Mappage catégorie paiement → catégorie comptable
function mapPaymentCategoryToAccounting(
  category: string
): 'adhesions' | 'courses' | 'subvention_mairie' | 'autre' {
  switch (category?.toLowerCase()) {
    case 'adhesion':
    case 'cotisation':
      return 'adhesions';
    case 'cours':
      return 'courses';
    case 'subvention':
      return 'subvention_mairie'; // À affiner selon context
    default:
      return 'autre';
  }
}
