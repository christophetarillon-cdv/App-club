'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, orderBy, query, doc, getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';

interface Season {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface DepositRow {
  memberName: string;
  amount: number;
  expectedDate: string;
  cmc7?: string;
}

interface Deposit {
  id: string;
  depositDate: string;
  bankAccount: string;
  totalAmount: number;
  chequeCount: number;
  createdAt: { toDate: () => Date } | null;
  pdfUrl?: string;
  installmentIds?: string[];
  rows?: DepositRow[];
}

export default function BankDepositsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [loadingDeposits, setLoadingDeposits] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  useEffect(() => {
    const loadSeasons = async () => {
      const snap = await getDocs(query(collection(db, 'seasons'), orderBy('startDate', 'desc')));
      const list: Season[] = snap.docs.map(d => ({
        id: d.id,
        label: d.data().label,
        startDate: d.data().startDate?.toDate?.()?.toISOString().slice(0, 10) ?? '',
        endDate: d.data().endDate?.toDate?.()?.toISOString().slice(0, 10) ?? '',
        isActive: d.data().isActive ?? false,
      }));
      setSeasons(list);
      const active = list.find(s => s.isActive);
      if (active) setSelectedSeasonId(active.id);
      else if (list.length > 0) setSelectedSeasonId(list[0]!.id);
      setLoadingSeasons(false);
    };
    loadSeasons();
  }, []);

  const loadDeposits = useCallback(async (seasonId: string) => {
    const season = seasons.find(s => s.id === seasonId);
    if (!season) return;
    setLoadingDeposits(true);

    const snap = await getDocs(query(collection(db, 'bankDeposits'), orderBy('depositDate', 'desc')));
    const all: Deposit[] = snap.docs.map(d => ({
      id: d.id,
      depositDate: d.data().depositDate,
      bankAccount: d.data().bankAccount,
      totalAmount: d.data().totalAmount,
      chequeCount: d.data().chequeCount,
      createdAt: d.data().createdAt ?? null,
      pdfUrl: d.data().pdfUrl,
      installmentIds: d.data().installmentIds,
      rows: d.data().rows,
    }));

    const filtered = all.filter(dep =>
      dep.depositDate >= season.startDate && dep.depositDate <= season.endDate
    );
    setDeposits(filtered);
    setLoadingDeposits(false);
  }, [seasons]);

  useEffect(() => {
    if (selectedSeasonId && seasons.length > 0) loadDeposits(selectedSeasonId);
  }, [selectedSeasonId, seasons, loadDeposits]);

  const regeneratePdf = async (deposit: Deposit) => {
    setGeneratingId(deposit.id);
    try {
      // Resolve rows: use stored snapshot or fetch from installmentIds
      let rows = deposit.rows;
      if (!rows && deposit.installmentIds && deposit.installmentIds.length > 0) {
        rows = await Promise.all(deposit.installmentIds.map(async (iid) => {
          const instSnap = await getDoc(doc(db, 'paymentInstallments', iid));
          if (!instSnap.exists()) return null;
          const data = instSnap.data();
          let memberName = data.userId as string;
          const accSnap = await getDoc(doc(db, 'accounts', data.userId));
          if (accSnap.exists()) {
            const dancerIds: string[] = accSnap.data().dancerIds ?? [];
            if (dancerIds.length > 0) {
              const dancerSnap = await getDoc(doc(db, 'dancers', dancerIds[0]!));
              if (dancerSnap.exists()) {
                const dn = dancerSnap.data();
                memberName = `${dn.firstName} ${dn.lastName}`;
              }
            }
            if (memberName === data.userId) memberName = accSnap.data().displayName ?? memberName;
          }
          let cmc7: string | undefined;
          if (data.chequeImageId) {
            const imgSnap = await getDoc(doc(db, 'chequeImages', data.chequeImageId));
            if (imgSnap.exists()) cmc7 = imgSnap.data().cmc7;
          }
          return { memberName, amount: data.amount as number, expectedDate: data.expectedDate as string, cmc7 };
        })).then(res => res.filter(Boolean) as DepositRow[]);
      }
      if (!rows || rows.length === 0) return;

      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const { height } = page.getSize();
      let y = height - 50;

      page.drawText('Bordereau de remise de chèques', { x: 50, y, size: 16, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      y -= 30;
      page.drawText(`Date de remise : ${deposit.depositDate}`, { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 15;
      page.drawText(`Compte bancaire : ${deposit.bankAccount}`, { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 30;

      page.drawText('Prénom Nom', { x: 50, y, size: 10, font: fontBold });
      page.drawText('Montant', { x: 300, y, size: 10, font: fontBold });
      page.drawText('CMC7', { x: 400, y, size: 10, font: fontBold });
      y -= 5;
      page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      y -= 15;

      for (const row of rows) {
        page.drawText(row.memberName, { x: 50, y, size: 10, font });
        page.drawText(`${(row.amount / 100).toFixed(2)} €`, { x: 300, y, size: 10, font });
        if (row.cmc7) page.drawText(row.cmc7.slice(0, 25), { x: 400, y, size: 8, font });
        y -= 18;
      }

      y -= 10;
      page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      y -= 18;
      page.drawText(`Total : ${(deposit.totalAmount / 100).toFixed(2)} €`, { x: 300, y, size: 11, font: fontBold });
      page.drawText(`${deposit.chequeCount} chèque${deposit.chequeCount > 1 ? 's' : ''}`, { x: 50, y, size: 11, font: fontBold });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bordereau-${deposit.depositDate}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setGeneratingId(null);
    }
  };

  const selectedSeason = seasons.find(s => s.id === selectedSeasonId);
  const grandTotal = deposits.reduce((sum, d) => sum + d.totalAmount, 0);
  const grandCount = deposits.reduce((sum, d) => sum + d.chequeCount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bordereaux de remise</h1>
        <Link href="/admin/payments/bank-deposits/new"
          className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          + Nouveau bordereau
        </Link>
      </div>

      {loadingSeasons ? (
        <p className="text-gray-500 text-sm">Chargement…</p>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap mb-6">
            {seasons.map(s => (
              <button key={s.id} onClick={() => setSelectedSeasonId(s.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  selectedSeasonId === s.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {s.label}{s.isActive && ' ●'}
              </button>
            ))}
          </div>

          {loadingDeposits ? (
            <p className="text-gray-500 text-sm">Chargement…</p>
          ) : deposits.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
              <p className="text-gray-400 text-sm">
                Aucun bordereau pour la saison {selectedSeason?.label ?? ''}.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4">
                <div className="divide-y divide-gray-50">
                  {deposits.map(dep => (
                    <div key={dep.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">
                          {new Date(dep.depositDate + 'T12:00:00').toLocaleDateString('fr-FR', {
                            day: 'numeric', month: 'long', year: 'numeric',
                          })}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{dep.bankAccount}</p>
                        {dep.rows && (
                          <div className="mt-1.5 space-y-0.5">
                            {dep.rows.map((r, i) => (
                              <p key={i} className="text-xs text-gray-400">
                                {r.memberName} — {(r.amount / 100).toFixed(2)} €
                                {r.cmc7 && <span className="font-mono ml-2">{r.cmc7.slice(0, 20)}</span>}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-500">
                          {dep.chequeCount} chèque{dep.chequeCount > 1 ? 's' : ''}
                        </p>
                        <p className="font-bold text-gray-900 text-sm">{(dep.totalAmount / 100).toFixed(2)} €</p>
                      </div>
                      {dep.pdfUrl ? (
                        <a href={dep.pdfUrl} target="_blank" rel="noreferrer"
                          className="flex-shrink-0 text-xs text-blue-600 hover:underline ml-2">
                          PDF
                        </a>
                      ) : (
                        <button
                          onClick={() => regeneratePdf(dep)}
                          disabled={generatingId === dep.id}
                          title="Régénérer le PDF"
                          className="flex-shrink-0 text-xs text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline ml-2">
                          {generatingId === dep.id ? '…' : 'PDF ↺'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-3 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {deposits.length} bordereau{deposits.length > 1 ? 'x' : ''} — {grandCount} chèque{grandCount > 1 ? 's' : ''}
                </p>
                <p className="font-bold text-gray-900">{(grandTotal / 100).toFixed(2)} €</p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
