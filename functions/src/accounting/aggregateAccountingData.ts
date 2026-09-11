import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

const getDb = () => admin.firestore();

// Déclenché quand une écriture est créée/modifiée
// Recalcule les agrégations (bilan, ventilation) pour la saison
export const aggregateAccountingData = onDocumentWritten(
  { region: 'europe-west3', document: 'accountingEntries/{entryId}' },
  async (event) => {
    const entry = event.data?.after?.data() as any;

    if (!entry) return; // Suppression

    const seasonId = entry.seasonId;

    try {
      // 1. Recalcul du bilan de fin de période
      await updateBalanceSheet(seasonId);

      // 2. Recalcul de la ventilation mensuelle
      const month = new Date(entry.date).toISOString().substring(0, 7); // "2024-09"
      await updateVentilation(seasonId, month);

      // 3. Recalcul de la ventilation de la saison
      await updateVentilation(seasonId, seasonId);

      console.log(`[Accounting] Aggregated data for season ${seasonId}`);
    } catch (error) {
      console.error(`[Accounting] Error aggregating data for season ${seasonId}:`, error);
      throw error;
    }
  }
);

// Met à jour le bilan de fin de saison
async function updateBalanceSheet(seasonId: string): Promise<void> {
  // Récupère toutes les écritures de la saison
  const entries = await db
    .collection('accountingEntries')
    .where('seasonId', '==', seasonId)
    .where('status', '==', 'posted')
    .get()
    .then(snap => snap.docs.map(d => d.data() as any));

  if (entries.length === 0) return;

  // Récupère le plan comptable
  const chartSnap = await getDb().collection('chartOfAccounts').get();
  const chart = new Map(
    chartSnap.docs.map(d => [
      d.data().code,
      { label: d.data().label, type: d.data().type },
    ])
  );

  const byAccount: any = {};

  // Calcule les soldes par compte
  chart.forEach((account, code) => {
    const debit = entries
      .filter(e => e.debit.accountCode === code)
      .reduce((sum, e) => sum + e.debit.amount, 0);

    const credit = entries
      .filter(e => e.credit.accountCode === code)
      .reduce((sum, e) => sum + e.credit.amount, 0);

    byAccount[code] = {
      label: account.label,
      type: account.type as any,
      debit,
      credit,
      balance: debit - credit,
    };
  });

  // Calcule les totaux
  const totalAssets = Object.values(byAccount)
    .filter((a: any) => a.type === 'asset')
    .reduce((sum: any, a: any) => sum + a.balance, 0);

  const totalLiabilities = Object.values(byAccount)
    .filter((a: any) => a.type === 'liability')
    .reduce((sum: any, a: any) => sum + a.balance, 0);

  const totalEquity = Object.values(byAccount)
    .filter((a: any) => a.type === 'equity')
    .reduce((sum: any, a: any) => sum + a.balance, 0);

  const netResult = Object.values(byAccount)
    .filter((a: any) => a.type === 'income' || a.type === 'expense')
    .reduce((sum: any, a: any) => {
      if (a.type === 'income') return sum + a.balance;
      else return sum - a.balance;
    }, 0);

  const sheet: any = {
    id: `balance_${seasonId}`,
    seasonId,
    asOf: Date.now(),
    byAccount,
    totals: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      netResult,
    },
    calculatedAt: Date.now(),
  };

  // Sauvegarde ou mise à jour
  await getDb().collection('balanceSheets').doc(`balance_${seasonId}`).set(sheet, { merge: true });
}

// Met à jour la ventilation par catégorie (mensuelle ou saison)
async function updateVentilation(seasonId: string, period: string): Promise<void> {
  // Filtre les entrées pour la période
  let query = db
    .collection('accountingEntries')
    .where('seasonId', '==', seasonId)
    .where('status', '==', 'posted');

  // Si c'est un mois (format "2024-09"), filtre par date
  if (period !== seasonId && period.length === 7) {
    const [year, month] = period.split('-');
    const startDate = new Date(`${year}-${month}-01`).getTime();
    const endDate = new Date(parseInt(year), parseInt(month), 0).getTime();
    query = query.where('date', '>=', startDate).where('date', '<=', endDate);
  }

  const entries = await query.get().then(snap => snap.docs.map(d => d.data() as any));

  if (entries.length === 0) return;

  const byCategory: any = {};
  const byBankAccount: any = {};

  // Ventilation par catégorie
  entries.forEach(entry => {
    if (!byCategory[entry.category]) {
      byCategory[entry.category] = { count: 0 };
    }

    const cat = byCategory[entry.category];
    cat.count += 1;

    if (entry.credit.accountCode.startsWith('7')) {
      cat.revenue = (cat.revenue || 0) + entry.credit.amount;
    } else if (entry.debit.accountCode.startsWith('6')) {
      cat.expense = (cat.expense || 0) + entry.debit.amount;
    }

    if (!cat.entries) cat.entries = [];
    cat.entries.push(entry.id);
  });

  // Ventilation par compte bancaire
  entries.forEach(entry => {
    if (!byBankAccount[entry.bankAccount]) {
      byBankAccount[entry.bankAccount] = { debit: 0, credit: 0, balance: 0 };
    }

    const acc = byBankAccount[entry.bankAccount];
    acc.debit += entry.debit.amount;
    acc.credit += entry.credit.amount;
    acc.balance = acc.credit - acc.debit;
  });

  const totalRevenue = Object.values(byCategory).reduce((sum: number, c: any) => sum + (c.revenue || 0), 0);
  const totalExpense = Object.values(byCategory).reduce((sum: number, c: any) => sum + (c.expense || 0), 0);

  const ventilation: any = {
    id: `vent_${seasonId}_${period}`,
    seasonId,
    period,
    byCategory,
    byBankAccount,
    totals: {
      totalRevenue,
      totalExpense,
      netResult: totalRevenue - totalExpense,
    },
    calculatedAt: Date.now(),
  };

  await db
    .collection('ventilationSummaries')
    .doc(`vent_${seasonId}_${period}`)
    .set(ventilation, { merge: true });
}
