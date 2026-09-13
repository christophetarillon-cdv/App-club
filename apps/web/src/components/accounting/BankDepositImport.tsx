'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, updateDoc,
} from 'firebase/firestore';
import { METHOD_LABEL, type PaymentMethod } from '@/lib/payment-constants';

interface BankDeposit {
  id: string;
  depositDate: string;
  paymentMethod: PaymentMethod;
  label?: string;
  bankAccountId: string;
  bankAccountName: string;
  totalAmount: number; // centimes
  itemCount: number;
  accountingEntryId?: string;
}

interface SeasonRange {
  label: string;
  start: Date;
  end: Date;
  isActive: boolean;
}

interface BankDepositImportProps {
  userId: string;
  onImported?: (seasonId: string) => void;
}

export default function BankDepositImport({ userId, onImported }: BankDepositImportProps) {
  const [deposits, setDeposits] = useState<BankDeposit[]>([]);
  const [seasons, setSeasons] = useState<SeasonRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'seasons')).then((snap) => {
      const list: SeasonRange[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const start = data.startDate?.toDate?.();
        const end = data.endDate?.toDate?.();
        if (start && end) {
          list.push({ label: data.label, start, end, isActive: !!data.isActive });
        }
      });
      setSeasons(list);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'bankDeposits'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: BankDeposit[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (!data.accountingEntryId) {
          list.push({
            id: d.id,
            depositDate: data.depositDate,
            paymentMethod: data.paymentMethod,
            label: data.label,
            bankAccountId: data.bankAccountId,
            bankAccountName: data.bankAccountName,
            totalAmount: data.totalAmount,
            itemCount: data.itemCount,
          });
        }
      });
      setDeposits(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const resolveSeasonId = (depositDateStr: string): string => {
    const depositDate = new Date(depositDateStr);
    const found = seasons.find((s) => depositDate >= s.start && depositDate <= s.end);
    if (found) return found.label;
    const active = seasons.find((s) => s.isActive);
    return active?.label ?? seasons[0]?.label ?? '';
  };

  const handleImport = async (deposit: BankDeposit) => {
    setImportingId(deposit.id);
    setError('');
    setSuccess('');
    try {
      const seasonId = resolveSeasonId(deposit.depositDate);
      if (!seasonId) {
        setError('Impossible de déterminer la saison pour cette date — vérifie les saisons configurées.');
        return;
      }

      const entryRef = await addDoc(collection(db, 'accountingEntries'), {
        seasonId,
        date: new Date(deposit.depositDate).getTime(),
        description: deposit.label || `Remise en banque - ${METHOD_LABEL[deposit.paymentMethod]} (${deposit.itemCount})`,
        amount: deposit.totalAmount / 100,
        type: 'income',
        bankAccount: deposit.bankAccountId,
        analyticsCategory: 'Adhésions & Cotisations',
        reconciled: false,
        hasReceipt: true,
        statementNumber: null,
        status: 'posted',
        createdAt: Date.now(),
        createdBy: userId,
        sourceBankDepositId: deposit.id,
      });

      await updateDoc(doc(db, 'bankDeposits', deposit.id), {
        accountingEntryId: entryRef.id,
      });

      setSuccess(`Écriture ajoutée à la saison ${seasonId}.`);
      onImported?.(seasonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'import');
    } finally {
      setImportingId(null);
    }
  };

  if (loading) return null;
  if (deposits.length === 0 && !success) return null;

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50">
        <h2 className="text-lg font-semibold">Mises en banque à importer ({deposits.length})</h2>
        <p className="text-sm text-gray-500 mt-1">
          Bordereaux de remise en banque générés depuis Finance, pas encore intégrés au journal comptable.
        </p>
      </div>
      {success && <div className="mx-6 mt-4 bg-green-50 text-green-700 p-3 rounded text-sm">{success}</div>}
      {error && <div className="m-4 bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}
      <div className="divide-y">
        {deposits.map((deposit) => (
          <div key={deposit.id} className="px-6 py-4 flex items-center justify-between">
            <div>
              <p className="font-medium">
                {deposit.label || `Remise ${METHOD_LABEL[deposit.paymentMethod]}`}
                <span className="ml-2 text-xs text-gray-500">
                  {new Date(deposit.depositDate).toLocaleDateString('fr-FR')} · {deposit.bankAccountName} · {deposit.itemCount} élément(s)
                </span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              <p className="font-mono font-semibold text-green-600">
                +{(deposit.totalAmount / 100).toFixed(2)} €
              </p>
              <button
                onClick={() => handleImport(deposit)}
                disabled={importingId === deposit.id}
                className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
              >
                {importingId === deposit.id ? 'Import...' : 'Importer'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
