'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import QRCode from 'react-qr-code';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import type { RaffleEntry } from '@cdv/types';

function tsToDateStr(ts: any): string {
  if (ts?.toDate) return ts.toDate().toLocaleDateString('fr-FR');
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000).toLocaleDateString('fr-FR');
  return '';
}

export default function TirageAuSortAdminPage() {
  const [entries, setEntries] = useState<RaffleEntry[] | null>(null);
  const [redeemedByCode, setRedeemedByCode] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);
  const [jeuUrl, setJeuUrl] = useState('');
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'raffleEntries'), orderBy('createdAt', 'desc'))).then(async snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as RaffleEntry));
      setEntries(rows);

      const codes = rows.map(r => r.winnerCode).filter((c): c is string => !!c);
      const pairs = await Promise.all(codes.map(async c => {
        const codeSnap = await getDoc(doc(db, 'raffleWinnerCodes', c));
        return [c, codeSnap.data()?.redeemed === true] as const;
      }));
      setRedeemedByCode(Object.fromEntries(pairs));
    });
  }, []);

  useEffect(() => {
    setJeuUrl(`${window.location.origin}/jeu`);
  }, []);

  const downloadQR = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const size = 800;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const a = document.createElement('a');
      a.download = 'qr-code-tirage-au-sort.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleExport = () => {
    if (!entries) return;
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Nom', 'Prénom', 'Email', 'Adhérent', 'Gagnant', 'Code', 'Code utilisé', 'Date d\'inscription'],
        ...entries.map(e => [
          e.nom, e.prenom, e.email, e.isDancer ? 'Oui' : 'Non', e.hasWon ? 'Oui' : 'Non',
          e.winnerCode ?? '',
          e.winnerCode ? (redeemedByCode[e.winnerCode] ? 'Oui' : 'Non') : '',
          tsToDateStr(e.createdAt),
        ]),
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Inscrits');
      XLSX.writeFile(wb, `tirage-au-sort-inscrits-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-gray-800">Tirage au sort</h1>
        <Link
          href="/tirage-au-sort"
          target="_blank"
          className="text-sm font-semibold text-white bg-orange hover:bg-orangeDark px-4 py-2 rounded-lg transition-colors"
        >
          Ouvrir la roulette →
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-6">Inscrits au jeu-concours (page publique /jeu).</p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 flex items-center gap-5">
        <div ref={qrRef} className="bg-white p-2 rounded-lg border border-gray-100 shrink-0">
          {jeuUrl && <QRCode value={jeuUrl} size={110} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 mb-1">QR code d&apos;accès au jeu</p>
          <p className="text-xs text-gray-500 mb-3 truncate">{jeuUrl}</p>
          <button
            onClick={downloadQR}
            disabled={!jeuUrl}
            className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-40"
          >
            Télécharger le QR code (.png)
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-600">
          {entries === null ? 'Chargement…' : `${entries.length} inscrit${entries.length > 1 ? 's' : ''}`}
        </p>
        <button
          onClick={handleExport}
          disabled={!entries || entries.length === 0 || exporting}
          className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline"
        >
          {exporting ? 'Export…' : 'Télécharger la liste (.xlsx)'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2">Nom</th>
              <th className="px-4 py-2">Prénom</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Adhérent</th>
              <th className="px-4 py-2">Gagnant</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Inscrit le</th>
            </tr>
          </thead>
          <tbody>
            {entries?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Aucun inscrit pour le moment.</td></tr>
            )}
            {entries?.map(e => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-800">{e.nom}</td>
                <td className="px-4 py-2 text-gray-800">{e.prenom}</td>
                <td className="px-4 py-2 text-gray-600">{e.email}</td>
                <td className="px-4 py-2 text-gray-600">{e.isDancer ? 'Oui' : 'Non'}</td>
                <td className="px-4 py-2">
                  {e.hasWon ? (
                    <span className="inline-block bg-orange/10 text-orangeDark text-xs font-semibold px-2 py-0.5 rounded-full">Gagnant</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {e.winnerCode ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="font-mono text-gray-700">{e.winnerCode}</span>
                      {redeemedByCode[e.winnerCode] ? (
                        <span className="text-xs text-green-600 font-medium">Utilisé</span>
                      ) : (
                        <span className="text-xs text-gray-400">Non utilisé</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">{tsToDateStr(e.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
