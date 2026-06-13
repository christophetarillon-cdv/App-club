'use client';

import { useState } from 'react';
import QRCode from 'react-qr-code';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { Dancer } from '@cdv/types';

export default function MemberCardPage() {
  const { dancers } = useAuth();
  const router = useRouter();
  const [selectedDancerId, setSelectedDancerId] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  const dancer: Dancer | undefined = dancers.find(d => d.id === selectedDancerId) ?? dancers[0];
  const isTrial = dancer?.roles.includes('trial') ?? false;

  const handleDownloadPdf = async () => {
    if (!dancer) return;
    setGenerating(true);
    try {
      const [{ PDFDocument, rgb, StandardFonts }, QRLib] = await Promise.all([
        import('pdf-lib'),
        import('qrcode'),
      ]);

      // Dimensions carte bancaire : 85.6mm × 54mm en points (1mm ≈ 2.835pt)
      const W = Math.round(85.6 * 2.835);
      const H = Math.round(54 * 2.835);

      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([W, H]);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const bgColor = isTrial ? rgb(0.8, 0.35, 0.1) : rgb(0.106, 0.227, 0.42);

      page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bgColor });

      page.drawText('CDV', { x: 14, y: H - 26, size: 16, font: bold, color: rgb(1, 1, 1) });
      if (isTrial) {
        page.drawText('Essai', { x: 14, y: H - 40, size: 9, font: regular, color: rgb(1, 0.9, 0.8) });
      }

      const fullName = `${dancer.firstName} ${dancer.lastName}`;
      page.drawText(fullName, { x: 14, y: 58, size: 11, font: bold, color: rgb(1, 1, 1) });

      if (dancer.memberNumber) {
        page.drawText(dancer.memberNumber, { x: 14, y: 44, size: 8, font: regular, color: rgb(0.85, 0.85, 0.85) });
      }

      // QR code en PNG
      const qrDataUrl: string = await QRLib.toDataURL(dancer.id, { width: 100, margin: 1 });
      const qrBytes = await fetch(qrDataUrl).then(r => r.arrayBuffer());
      const qrImg = await pdfDoc.embedPng(qrBytes);
      const qrSize = 88;
      page.drawImage(qrImg, { x: W - qrSize - 10, y: (H - qrSize) / 2, width: qrSize, height: qrSize });

      // Photo si disponible
      if (dancer.photoUrl) {
        try {
          const imgBytes = await fetch(dancer.photoUrl).then(r => r.arrayBuffer());
          const embeddedPhoto = await pdfDoc.embedJpg(imgBytes).catch(() => pdfDoc.embedPng(imgBytes));
          const photoSize = 44;
          page.drawImage(embeddedPhoto, { x: 14, y: H - 26 - photoSize - 8, width: photoSize, height: photoSize });
        } catch { /* photo non accessible, on ignore */ }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carte-${dancer.firstName.toLowerCase()}-${dancer.lastName.toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  };

  if (dancers.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Aucun danseur trouvé.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto pt-8 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 -ml-1 rounded-lg hover:bg-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">Ma carte de membre</h1>
        </div>

        {/* Sélecteur danseur si plusieurs */}
        {dancers.length > 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Danseur</label>
            <select
              value={selectedDancerId || dancer?.id || ''}
              onChange={e => setSelectedDancerId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
              {dancers.map(d => (
                <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
              ))}
            </select>
          </div>
        )}

        {dancer && (
          <>
            {/* Carte numérique */}
            <div className={`rounded-2xl shadow-sm p-6 flex flex-col items-center gap-4 ${
              isTrial ? 'bg-orange-500' : 'bg-blue-900'
            }`}>
              {isTrial && (
                <span className="self-start text-xs font-semibold bg-orange-400 text-white px-2 py-0.5 rounded-full">
                  Cours d'essai
                </span>
              )}

              {dancer.photoUrl
                ? <img src={dancer.photoUrl} alt="" className="w-24 h-24 rounded-full object-cover border-2 border-white/30" />
                : (
                  <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="text-white font-bold text-3xl">{dancer.firstName[0]}{dancer.lastName[0]}</span>
                  </div>
                )
              }

              <div className="text-center">
                <p className="font-bold text-white text-xl">{dancer.firstName} {dancer.lastName}</p>
                {dancer.memberNumber && (
                  <p className="text-white/60 font-mono text-sm mt-0.5">{dancer.memberNumber}</p>
                )}
              </div>

              <div className="bg-white p-2 rounded-xl">
                <QRCode value={dancer.id} size={160} />
              </div>
            </div>

            {/* Bouton PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={generating}
              className="w-full bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors text-sm">
              {generating ? 'Génération du PDF…' : 'Télécharger ma carte (PDF)'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
