'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, getDoc,
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import Link from 'next/link';

type TabKey = 'ocr_pending' | 'to_validate' | 'validated';

interface ChequeRow {
  id: string;
  storagePath: string;
  uploadedAt: { toDate: () => Date } | null;
  ocrProcessedAt: { toDate: () => Date } | null;
  validatedAt: { toDate: () => Date } | null;
  amountFromOcr?: number;
  amountConfidence?: string;
  validatedAmount?: number;
  installmentId?: string;
  memberName?: string;
  thumbnailUrl?: string;
}

const TAB_LABELS: Record<TabKey, string> = {
  ocr_pending: 'En attente OCR',
  to_validate: 'À valider',
  validated: 'Validés',
};

export default function ChequesListPage() {
  const [tab, setTab] = useState<TabKey>('to_validate');
  const [rows, setRows] = useState<ChequeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const snap = await getDocs(collection(db, 'chequeImages'));
      const allDocs: ChequeRow[] = snap.docs.map(d => ({
        id: d.id,
        storagePath: d.data().storagePath,
        uploadedAt: d.data().uploadedAt ?? null,
        ocrProcessedAt: d.data().ocrProcessedAt ?? null,
        validatedAt: d.data().validatedAt ?? null,
        amountFromOcr: d.data().amountFromOcr,
        amountConfidence: d.data().amountConfidence,
        validatedAmount: d.data().validatedAmount,
        installmentId: d.data().installmentId,
      }));

      const filtered = allDocs.filter(d => {
        if (tab === 'ocr_pending') return !d.ocrProcessedAt;
        if (tab === 'to_validate') return !!d.ocrProcessedAt && !d.validatedAt;
        return !!d.validatedAt;
      });

      const enriched = await Promise.all(filtered.map(async (ch) => {
        let thumbnailUrl: string | undefined;
        try {
          thumbnailUrl = await getDownloadURL(ref(storage, ch.storagePath));
        } catch { /* storage not accessible */ }

        let memberName: string | undefined;
        if (ch.installmentId) {
          try {
            const instSnap = await getDoc(doc(db, 'paymentInstallments', ch.installmentId));
            if (instSnap.exists()) {
              const accSnap = await getDoc(doc(db, 'accounts', instSnap.data().userId));
              if (accSnap.exists()) memberName = accSnap.data().displayName;
            }
          } catch { /* ignore */ }
        }

        return { ...ch, thumbnailUrl, memberName };
      }));

      setRows(enriched);
      setLoading(false);
    };
    load();
  }, [tab]);

  const confidenceColor = (c?: string) => {
    if (c === 'high') return 'text-green-700 bg-green-50';
    if (c === 'medium') return 'text-orange-700 bg-orange-50';
    return 'text-red-700 bg-red-50';
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Chèques</h1>

      <div className="flex gap-2 mb-6">
        {(Object.keys(TAB_LABELS) as TabKey[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${tab === t ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? <p className="text-gray-500 text-sm">Chargement…</p> : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
          <p className="text-gray-400 text-sm">Aucun chèque.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {rows.map(ch => (
            <Link key={ch.id} href={`/admin/payments/cheques/${ch.id}`}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="aspect-[3/2] bg-gray-100 overflow-hidden">
                {ch.thumbnailUrl ? (
                  <img src={ch.thumbnailUrl} alt="chèque" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Chargement…</div>
                )}
              </div>
              <div className="p-3">
                {ch.memberName && <p className="text-xs font-medium text-gray-700 truncate">{ch.memberName}</p>}
                {ch.amountFromOcr !== undefined && (
                  <p className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block font-medium ${confidenceColor(ch.amountConfidence)}`}>
                    {(ch.amountFromOcr / 100).toFixed(2)} €
                  </p>
                )}
                {ch.validatedAmount !== undefined && (
                  <p className="text-xs text-green-700 font-medium mt-1">Validé : {(ch.validatedAmount / 100).toFixed(2)} €</p>
                )}
                {ch.uploadedAt && (
                  <p className="text-xs text-gray-400 mt-1">{ch.uploadedAt.toDate().toLocaleDateString('fr-FR')}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
