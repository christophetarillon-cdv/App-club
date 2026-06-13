'use client';

import { useState, useEffect } from 'react';
import {
  doc, getDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ChequeImage {
  installmentId?: string;
  storagePath: string;
  uploadedBy: string;
  uploadedAt: { toDate: () => Date };
  cmc7?: string;
  chequeNumber?: string;
  draweeBank?: string;
  draweeCity?: string;
  amountFromOcr?: number;
  amountConfidence?: string;
  ocrRawText?: string;
  ocrProcessedAt?: { toDate: () => Date } | null;
  validatedAmount?: number;
  validatedBy?: string;
  validatedAt?: { toDate: () => Date } | null;
}

interface Installment {
  expectedDate: string;
  amount: number;
  userId: string;
  membershipId: string;
}

function confidenceClass(c?: string) {
  if (c === 'high') return 'text-green-700 border-green-300 bg-green-50';
  if (c === 'medium') return 'text-orange-700 border-orange-300 bg-orange-50';
  if (c === 'low') return 'text-red-700 border-red-300 bg-red-50';
  return 'text-gray-600 border-gray-300 bg-gray-50';
}

function confidenceLabel(c?: string) {
  if (c === 'high') return 'OCR fiable';
  if (c === 'medium') return 'OCR incertain';
  if (c === 'low') return 'OCR peu fiable';
  return 'OCR non traité';
}

export default function ChequeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [cheque, setCheque] = useState<ChequeImage | null>(null);
  const [installment, setInstallment] = useState<Installment | null>(null);
  const [memberName, setMemberName] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [validatedAmount, setValidatedAmount] = useState('');
  const [draweeBank, setDraweeBank] = useState('');
  const [draweeCity, setDraweeCity] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, 'chequeImages', id));
      if (!snap.exists()) { setLoading(false); return; }
      const data = snap.data() as ChequeImage;
      setCheque(data);
      setDraweeBank(data.draweeBank ?? '');
      setDraweeCity(data.draweeCity ?? '');

      if (data.amountFromOcr !== undefined) {
        setValidatedAmount((data.amountFromOcr / 100).toFixed(2));
      }
      if (data.validatedAmount !== undefined) {
        setValidatedAmount((data.validatedAmount / 100).toFixed(2));
      }

      try {
        const url = await getDownloadURL(ref(storage, data.storagePath));
        setImageUrl(url);
      } catch { /* ignore */ }

      if (data.installmentId) {
        const instSnap = await getDoc(doc(db, 'paymentInstallments', data.installmentId));
        if (instSnap.exists()) {
          const inst = { id: instSnap.id, ...instSnap.data() as Omit<Installment, 'id'> };
          setInstallment(inst as Installment);
          const accSnap = await getDoc(doc(db, 'accounts', inst.userId));
          if (accSnap.exists()) setMemberName(accSnap.data().displayName);
        }
      }

      setLoading(false);
    };
    load();
  }, [id]);

  const handleSaveMeta = async () => {
    setSavingMeta(true);
    const updates = {
      draweeBank: draweeBank.trim() || null,
      draweeCity: draweeCity.trim() || null,
    };
    await updateDoc(doc(db, 'chequeImages', id), updates);
    // Sync to installment so bordereau can read directly
    if (cheque?.installmentId) {
      await updateDoc(doc(db, 'paymentInstallments', cheque.installmentId), updates);
    }
    setCheque(prev => prev ? { ...prev, draweeBank: draweeBank.trim() || undefined, draweeCity: draweeCity.trim() || undefined } : prev);
    setSavingMeta(false);
  };

  const handleValidate = async () => {
    if (!user || !cheque) return;
    setSaving(true);
    const cents = Math.round(parseFloat(validatedAmount) * 100);

    const deletionAt = new Date();
    deletionAt.setDate(deletionAt.getDate() + 90);

    await updateDoc(doc(db, 'chequeImages', id), {
      validatedAmount: cents,
      validatedBy: user.uid,
      validatedAt: serverTimestamp(),
      scheduledDeletionAt: deletionAt,
    });

    if (cheque.installmentId) {
      await updateDoc(doc(db, 'paymentInstallments', cheque.installmentId), {
        status: 'paid',
        actualDate: new Date().toISOString().slice(0, 10),
        chequeImageId: id,
      });
    }

    setCheque(prev => prev ? { ...prev, validatedAmount: cents, validatedAt: { toDate: () => new Date() } } : prev);
    setSaving(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement…</p>
    </div>
  );

  if (!cheque) return (
    <div className="p-8 text-center text-gray-400">Chèque introuvable.</div>
  );

  const isValidated = !!cheque.validatedAt;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/payments/cheques" className="text-sm text-gray-400 hover:text-gray-700">← Chèques</Link>
        <h1 className="text-2xl font-bold text-gray-900">Détail chèque</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Image */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt="chèque" className="w-full object-contain max-h-80" />
          ) : (
            <div className="flex items-center justify-center h-48 bg-gray-100 text-gray-300 text-sm">
              {cheque.ocrProcessedAt === null ? 'OCR en cours…' : 'Image non disponible'}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-4">
          {memberName && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-400 mb-1">Membre</p>
              <p className="font-semibold text-gray-900">{memberName}</p>
              {installment && (
                <p className="text-sm text-gray-500 mt-1">
                  Versement du {installment.expectedDate} — {(installment.amount / 100).toFixed(2)} €
                </p>
              )}
            </div>
          )}

          {/* OCR Results */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Résultat OCR</p>

            {cheque.ocrProcessedAt === null || cheque.ocrProcessedAt === undefined ? (
              <p className="text-sm text-gray-400">OCR en cours de traitement…</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${confidenceClass(cheque.amountConfidence)}`}>
                    {confidenceLabel(cheque.amountConfidence)}
                  </span>
                </div>

                {cheque.amountFromOcr !== undefined && (
                  <div>
                    <p className="text-xs text-gray-400">Montant détecté</p>
                    <p className="font-semibold text-gray-900">{(cheque.amountFromOcr / 100).toFixed(2)} €</p>
                  </div>
                )}

                {cheque.cmc7 && (
                  <div>
                    <p className="text-xs text-gray-400">CMC7</p>
                    <p className="font-mono text-sm text-gray-700">{cheque.cmc7}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Infos chèque */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Infos chèque</p>
            {cheque.chequeNumber && (
              <div>
                <p className="text-xs text-gray-400">N° chèque</p>
                <p className="font-mono font-semibold text-gray-900">{cheque.chequeNumber}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Banque</label>
                <input type="text" value={draweeBank} onChange={e => setDraweeBank(e.target.value)}
                  placeholder="ex : Crédit Mutuel"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Ville</label>
                <input type="text" value={draweeCity} onChange={e => setDraweeCity(e.target.value)}
                  placeholder="ex : Grenoble"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            </div>
            <button onClick={handleSaveMeta} disabled={savingMeta}
              className="text-xs text-blue-600 hover:underline disabled:text-gray-400">
              {savingMeta ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
          </div>

          {/* Validation */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Validation</p>

            {isValidated ? (
              <div className="flex items-center gap-2">
                <span className="text-green-700 text-sm font-semibold">Validé — {(cheque.validatedAmount! / 100).toFixed(2)} €</span>
                <span className="text-xs text-gray-400">{cheque.validatedAt?.toDate().toLocaleDateString('fr-FR')}</span>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Montant à valider (€)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={validatedAmount}
                    onChange={e => setValidatedAmount(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${confidenceClass(cheque.amountConfidence)} border`}
                  />
                </div>
                <button onClick={handleValidate} disabled={saving || !validatedAmount}
                  className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
                  {saving ? 'Validation…' : 'Valider ce chèque'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
