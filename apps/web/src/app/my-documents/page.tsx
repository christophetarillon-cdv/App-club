'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { useRouter } from 'next/navigation';
import type { PersonalDocument } from '@cdv/types';

const TYPE_LABELS: Record<string, string> = {
  receipt: 'Reçu de paiement',
  attestation: 'Attestation',
  invoice: 'Facture',
};

const TYPE_COLORS: Record<string, string> = {
  receipt: 'bg-green-100 text-green-700',
  attestation: 'bg-blue-100 text-blue-700',
  invoice: 'bg-purple-100 text-purple-700',
};

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate?.() ?? new Date(ts.seconds * 1000);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

export default function MyDocumentsPage() {
  const { user } = useAuth();
  const { selectedDancer } = useDancer();
  const router = useRouter();
  const [documents, setDocuments] = useState<PersonalDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDocs(
      query(collection(db, 'documents'), where('userId', '==', user.uid), orderBy('generatedAt', 'desc'))
    ).then(snap => {
      setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() } as PersonalDocument)));
      setLoading(false);
    });
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-700">← Retour</button>
          <h1 className="text-xl font-bold text-gray-900">Mes documents</h1>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : documents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-gray-500 text-sm">Aucun document disponible.</p>
            <p className="text-gray-400 text-xs mt-1">Les reçus de paiement apparaîtront ici automatiquement.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map(doc => (
              <div key={doc.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[doc.type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABELS[doc.type] ?? doc.type}
                      </span>
                      {doc.receiptNumber && (
                        <span className="text-xs text-gray-400 font-mono">#{doc.receiptNumber}</span>
                      )}
                    </div>
                    {doc.memberName && (
                      <p className="text-sm font-medium text-gray-900">{doc.memberName}</p>
                    )}
                    {doc.seasonLabel && (
                      <p className="text-xs text-gray-500">{doc.seasonLabel}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {doc.amount && (
                        <span className="text-sm font-semibold text-gray-800">{formatAmount(doc.amount)}</span>
                      )}
                      <span className="text-xs text-gray-400">{formatDate(doc.generatedAt)}</span>
                    </div>
                  </div>
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Télécharger
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
