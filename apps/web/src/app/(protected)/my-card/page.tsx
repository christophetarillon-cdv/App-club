'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function MyCardPage() {
  const { dancers } = useAuth();
  const [idx, setIdx] = useState(0);
  const [bright, setBright] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);

  if (dancers.length === 0) return null;

  const dancer = dancers[idx]!;
  const isTrial = dancer.roles.includes('trial');

  const bgColor = bright ? 'bg-white' : isTrial ? 'bg-orange-500' : 'bg-blue-900';
  const textColor = bright ? 'text-gray-900' : 'text-white';
  const subColor = bright ? 'text-gray-400' : 'text-white/60';

  const downloadQR = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const size = 400;
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
      a.download = `qr-${dancer.firstName}-${dancer.lastName}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center transition-colors duration-200 ${bgColor}`}>

      {/* Bouton retour */}
      <Link
        href="/profile"
        className={`absolute top-4 left-4 flex items-center gap-1 text-sm font-medium ${bright ? 'text-gray-500 hover:text-gray-800' : 'text-white/60 hover:text-white'} transition-colors`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour
      </Link>

      {/* Luminosité */}
      <p
        className={`text-xs mb-6 tracking-widest uppercase font-semibold cursor-pointer ${bright ? 'text-gray-400' : 'text-white/50'}`}
        onClick={() => setBright(b => !b)}
      >
        {bright ? 'Appuyer pour assombrir' : 'Appuyer pour éclaircir'}
      </p>

      {/* QR code — encode dancer.id */}
      <div ref={qrRef} className="bg-white p-4 rounded-2xl shadow-lg" onClick={() => setBright(b => !b)}>
        <QRCode value={dancer.id} size={220} />
      </div>

      {/* Nom + numéro */}
      <div className="mt-8 text-center">
        <p className={`text-2xl font-bold ${textColor}`}>
          {dancer.firstName} {dancer.lastName}
        </p>
        {dancer.memberNumber && (
          <p className={`text-sm font-mono mt-1 ${subColor}`}>{dancer.memberNumber}</p>
        )}
        {isTrial && (
          <span className="mt-3 inline-block text-xs font-semibold bg-white/20 text-white px-3 py-1 rounded-full">
            {"Cours d'essai"}
          </span>
        )}
      </div>

      {/* Bouton téléchargement */}
      <button
        onClick={downloadQR}
        className={`mt-6 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors ${
          bright
            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            : 'bg-white/15 text-white/80 hover:bg-white/25'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Télécharger le QR code
      </button>

      {/* Sélecteur de danseur (si plusieurs) */}
      {dancers.length > 1 && (
        <div className="mt-10 flex items-center gap-6">
          <button
            onClick={() => setIdx(i => (i - 1 + dancers.length) % dancers.length)}
            className={`w-10 h-10 rounded-full flex items-center justify-center ${bright ? 'bg-gray-100 text-gray-700' : 'bg-white/20 text-white'} hover:opacity-80 transition-opacity`}
          >
            ‹
          </button>

          <div className="flex gap-2">
            {dancers.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${i === idx ? (bright ? 'bg-gray-800' : 'bg-white') : (bright ? 'bg-gray-300' : 'bg-white/30')}`}
              />
            ))}
          </div>

          <button
            onClick={() => setIdx(i => (i + 1) % dancers.length)}
            className={`w-10 h-10 rounded-full flex items-center justify-center ${bright ? 'bg-gray-100 text-gray-700' : 'bg-white/20 text-white'} hover:opacity-80 transition-opacity`}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
