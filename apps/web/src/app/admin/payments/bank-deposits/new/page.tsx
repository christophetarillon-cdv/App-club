'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, doc, getDoc, updateDoc, writeBatch, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

interface InstallmentRow {
  id: string;
  membershipId: string;
  userId: string;
  amount: number;
  expectedDate: string;
  chequeImageId?: string;
  memberName?: string;
  chequeNumber?: string;
  draweeBank?: string;
  draweeCity?: string;
}

interface BankAccount {
  id: string;
  name: string;
  bank: string;
  accountNumber: string;
  holder: string;
  label: string;
}


export default function NewBankDepositPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InstallmentRow[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [depositLabel, setDepositLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateStep, setGenerateStep] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
      const [installSnap, bankSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'paymentInstallments'),
          where('method', '==', 'cheque'),
          where('status', '==', 'paid'),
        )),
        getDocs(query(collection(db, 'bankAccounts'), orderBy('name'))),
      ]);

      const accounts: BankAccount[] = bankSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name ?? '',
        bank: d.data().bank ?? '',
        accountNumber: d.data().accountNumber ?? '',
        holder: d.data().holder ?? '',
        label: d.data().label ?? '',
      }));
      setBankAccounts(accounts);
      if (accounts.length > 0) setSelectedBankAccountId(accounts[0]!.id);

      const eligible = installSnap.docs.filter(d => !d.data().bankDepositId);
      const rows: InstallmentRow[] = await Promise.all(eligible.map(async (d) => {
        const data = d.data();
        let memberName: string | undefined;
        // Read bank info from installment first (always available), fallback to chequeImages for chequeNumber
        let chequeNumber: string | undefined = data.chequeNumber ?? undefined;
        let draweeBank: string | undefined = data.draweeBank ?? undefined;
        let draweeCity: string | undefined = data.draweeCity ?? undefined;

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
          if (!memberName) memberName = accSnap.data().displayName;
        }

        if (data.chequeImageId && (!chequeNumber || !draweeBank || !draweeCity)) {
          const imgSnap = await getDoc(doc(db, 'chequeImages', data.chequeImageId));
          if (imgSnap.exists()) {
            if (!chequeNumber) chequeNumber = imgSnap.data().chequeNumber ?? undefined;
            if (!draweeBank) draweeBank = imgSnap.data().draweeBank ?? undefined;
            if (!draweeCity) draweeCity = imgSnap.data().draweeCity ?? undefined;
          }
        }

        return {
          id: d.id,
          membershipId: data.membershipId,
          userId: data.userId,
          amount: data.amount,
          expectedDate: data.expectedDate,
          chequeImageId: data.chequeImageId,
          memberName,
          chequeNumber,
          draweeBank,
          draweeCity,
        };
      }));

      setRows(rows);
    } catch (err) {
      console.error('Erreur chargement bordereau:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
    load();
  }, []);

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const updateRowMeta = async (id: string, field: 'draweeBank' | 'draweeCity' | 'chequeNumber', value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value || undefined } : r));
    await updateDoc(doc(db, 'paymentInstallments', id), { [field]: value.trim() || null });
  };

  const selectedRows = rows.filter(r => selected.has(r.id));
  const totalCents = selectedRows.reduce((sum, r) => sum + r.amount, 0);
  const selectedBankAccount = bankAccounts.find(a => a.id === selectedBankAccountId);

  const generateAndDeposit = async () => {
    if (!user || selectedRows.length === 0 || !selectedBankAccount) return;
    setGenerating(true);
    setGenerateStep('Chargement bibliothèque PDF…');
    setBlobUrl(null);
    setGenerated(false);
    setGenerateError(null);

    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      setGenerateStep('Création du PDF…');
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]); // A4
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const { height } = page.getSize();
      let y = height - 50;

      // Titre
      page.drawText('Bordereau de remise de chèques', {
        x: 50, y, size: 16, font: fontBold, color: rgb(0.1, 0.1, 0.1),
      });
      y -= 35;

      // Coordonnées bancaires
      page.drawText('Compte bénéficiaire', { x: 50, y, size: 9, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      y -= 14;
      page.drawText(selectedBankAccount.holder, { x: 50, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      y -= 14;
      page.drawText(`${selectedBankAccount.name} — ${selectedBankAccount.bank}`, { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 14;
      page.drawText(`N° compte : ${selectedBankAccount.accountNumber}`, { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
      if (selectedBankAccount.label) {
        y -= 12;
        page.drawText(selectedBankAccount.label, { x: 50, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
      }
      y -= 20;

      // Date de remise
      const dateFr = new Date(depositDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      page.drawText(`Date de remise : ${dateFr}`, { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      if (depositLabel) page.drawText(depositLabel, { x: 545 - font.widthOfTextAtSize(depositLabel, 11), y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 25;

      // Ligne de séparation
      page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
      y -= 18;

      // En-tête tableau
      page.drawText('Prénom Nom', { x: 50, y, size: 10, font: fontBold });
      page.drawText('Banque / Ville', { x: 200, y, size: 10, font: fontBold });
      page.drawText('N° chèque', { x: 360, y, size: 10, font: fontBold });
      page.drawText('Montant', { x: 460, y, size: 10, font: fontBold });
      y -= 5;
      page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      y -= 16;

      // Lignes chèques
      for (const row of selectedRows) {
        page.drawText(row.memberName ?? row.userId, { x: 50, y, size: 10, font });
        const bankInfo = [row.draweeBank, row.draweeCity].filter(Boolean).join(' / ');
        if (bankInfo) page.drawText(bankInfo.slice(0, 22), { x: 200, y, size: 9, font });
        if (row.chequeNumber) page.drawText(row.chequeNumber, { x: 360, y, size: 10, font: fontBold });
        page.drawText(`${(row.amount / 100).toFixed(2)} €`, { x: 460, y, size: 10, font });
        y -= 18;
      }

      // Total
      y -= 8;
      page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      y -= 18;
      page.drawText(`${selectedRows.length} chèque${selectedRows.length > 1 ? 's' : ''}`, { x: 50, y, size: 11, font: fontBold });
      page.drawText(`Total : ${(totalCents / 100).toFixed(2)} €`, { x: 360, y, size: 11, font: fontBold });

      setGenerateStep('Finalisation du PDF…');
      const pdfBytes = await pdfDoc.save();

      // Téléchargement immédiat
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const localUrl = URL.createObjectURL(blob);
      setBlobUrl(localUrl);
      const a = document.createElement('a');
      a.href = localUrl;
      a.download = `bordereau-${depositDate}.pdf`;
      a.click();

      // Upload Firebase Storage via API route serveur (non-bloquant)
      setGenerateStep('Enregistrement en base…');
      const depositId = doc(collection(db, 'bankDeposits')).id;
      let pdfStorageUrl: string | null = null;
      try {
        const formData = new FormData();
        formData.append('pdf', new File([pdfBytes.buffer as ArrayBuffer], `bordereau-${depositDate}.pdf`, { type: 'application/pdf' }));
        formData.append('depositId', depositId);
        const uploadRes = await fetch('/api/bank-deposits/upload-pdf', { method: 'POST', body: formData });
        if (uploadRes.ok) {
          const json = await uploadRes.json() as { url: string };
          pdfStorageUrl = json.url;
        } else {
          console.warn('Archivage PDF échoué (non bloquant):', await uploadRes.text());
        }
      } catch (uploadErr) {
        console.warn('Archivage PDF échoué (non bloquant):', uploadErr);
      }

      const seasonsSnap = await getDocs(query(collection(db, 'seasons'), where('isActive', '==', true)));
      const seasonId = seasonsSnap.docs[0]?.id ?? null;

      const batch = writeBatch(db);
      batch.set(doc(db, 'bankDeposits', depositId), {
        depositDate,
        ...(depositLabel ? { label: depositLabel } : {}),
        bankAccountId: selectedBankAccount.id,
        bankAccountName: selectedBankAccount.name,
        bankAccountHolder: selectedBankAccount.holder,
        bankAccountBank: selectedBankAccount.bank,
        bankAccountNumber: selectedBankAccount.accountNumber,
        installmentIds: selectedRows.map(r => r.id),
        totalAmount: totalCents,
        chequeCount: selectedRows.length,
        ...(pdfStorageUrl ? { pdfUrl: pdfStorageUrl } : {}),
        generatedBy: user.uid,
        createdAt: serverTimestamp(),
        ...(seasonId ? { seasonId } : {}),
        rows: selectedRows.map(r => ({
          memberName: r.memberName ?? r.userId,
          amount: r.amount,
          expectedDate: r.expectedDate,
          ...(r.chequeNumber ? { chequeNumber: r.chequeNumber } : {}),
          ...(r.draweeBank ? { draweeBank: r.draweeBank } : {}),
          ...(r.draweeCity ? { draweeCity: r.draweeCity } : {}),
        })),
      });
      for (const row of selectedRows) {
        batch.update(doc(db, 'paymentInstallments', row.id), { bankDepositId: depositId });
      }
      await batch.commit();

      setGenerated(true);
      setRows(prev => prev.filter(r => !selected.has(r.id)));
      setSelected(new Set());
    } catch (err) {
      console.error('Erreur génération bordereau:', err);
      setGenerateError(`[${generateStep}] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
      setGenerateStep(null);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/payments/bank-deposits" className="text-sm text-gray-400 hover:text-gray-700">← Bordereaux</Link>
        <h1 className="text-2xl font-bold text-gray-900">Nouveau bordereau</h1>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-red-700 font-medium">Erreur de chargement : {loadError}</p>
        </div>
      )}

      {generateError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-red-700 font-medium">Erreur : {generateError}</p>
        </div>
      )}

      {generated && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
          <p className="text-sm text-green-700 font-medium">Bordereau généré et archivé.</p>
          {blobUrl && (
            <a href={blobUrl} download={`bordereau-${depositDate}.pdf`}
              className="text-sm text-green-700 underline font-semibold">
              Télécharger à nouveau →
            </a>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? <p className="text-gray-500 text-sm">Chargement…</p> : rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
              <p className="text-gray-400 text-sm">Aucun chèque à remettre en banque.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <button type="button"
                  onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))}
                  className="text-xs text-blue-600 hover:underline">
                  {selected.size === rows.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                {selected.size > 0 && (
                  <span className="text-xs text-gray-400">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {rows.map(row => (
                  <div key={row.id} className="px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)}
                        className="rounded mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-gray-900 text-sm">{row.memberName ?? row.userId}</p>
                          <p className="font-semibold text-gray-800 text-sm flex-shrink-0">{(row.amount / 100).toFixed(2)} €</p>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{row.expectedDate}</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          <input
                            type="text" placeholder="Banque" defaultValue={row.draweeBank ?? ''}
                            onBlur={e => updateRowMeta(row.id, 'draweeBank', e.target.value)}
                            className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <input
                            type="text" placeholder="Ville" defaultValue={row.draweeCity ?? ''}
                            onBlur={e => updateRowMeta(row.id, 'draweeCity', e.target.value)}
                            className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <input
                            type="text" placeholder="N° chèque" defaultValue={row.chequeNumber ?? ''}
                            onBlur={e => updateRowMeta(row.id, 'chequeNumber', e.target.value)}
                            className="border border-gray-200 rounded px-2 py-1 text-xs font-mono text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Paramètres du bordereau</p>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Date de remise</label>
              <input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Libellé <span className="text-gray-300">(optionnel)</span></label>
              <input type="text" value={depositLabel} onChange={e => setDepositLabel(e.target.value)}
                placeholder="ex : Remise n°3 — juin 2026"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Compte bancaire</label>
              {bankAccounts.length === 0 ? (
                <p className="text-xs text-orange-600">
                  Aucun compte configuré.{' '}
                  <Link href="/admin/settings/bank-accounts" className="underline">Ajouter un compte →</Link>
                </p>
              ) : (
                <select value={selectedBankAccountId} onChange={e => setSelectedBankAccountId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                  {bankAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>
                  ))}
                </select>
              )}
            </div>
            {selectedBankAccount && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
                <p className="text-xs font-medium text-gray-700">{selectedBankAccount.holder}</p>
                <p className="text-xs font-mono text-gray-500">{selectedBankAccount.accountNumber}</p>
                {selectedBankAccount.label && <p className="text-xs text-gray-400 italic">{selectedBankAccount.label}</p>}
              </div>
            )}
          </div>

          {selected.size > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{selected.size} chèque{selected.size > 1 ? 's' : ''}</span>
                <span className="font-bold text-gray-900">{(totalCents / 100).toFixed(2)} €</span>
              </div>
            </div>
          )}

          <button onClick={generateAndDeposit}
            disabled={generating || selected.size === 0 || !selectedBankAccount || !depositDate}
            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
            {generating ? (generateStep ?? 'Génération…') : 'Générer le bordereau PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
