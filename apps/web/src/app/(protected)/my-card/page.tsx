'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { useAuth } from '@/contexts/AuthContext';

export default function MyCardPage() {
  const { user, dancers } = useAuth();
  const [bright, setBright] = useState(false);

  // Passe en plein écran si l'API est disponible (tablette)
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);

  if (!user) return null;

  const dancer = dancers[0];
  const name = dancer ? `${dancer.firstName} ${dancer.lastName}` : '';
  const isTrial = dancer?.roles.includes('trial') ?? false;

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center transition-colors duration-200 ${
        bright ? 'bg-white' : isTrial ? 'bg-orange-500' : 'bg-blue-900'
      }`}
      onClick={() => setBright(b => !b)}
    >
      {/* Tap pour augmenter la luminosité de l'écran */}
      <p className={`text-xs mb-6 tracking-widest uppercase font-semibold ${
        bright ? 'text-gray-400' : 'text-white/50'
      }`}>
        {bright ? 'Appuyer pour assombrir' : 'Appuyer pour éclaircir'}
      </p>

      {/* QR code */}
      <div className="bg-white p-4 rounded-2xl shadow-lg">
        <QRCode value={user.uid} size={220} />
      </div>

      {/* Nom + numéro */}
      <div className="mt-8 text-center">
        {name && (
          <p className={`text-2xl font-bold ${bright ? 'text-gray-900' : 'text-white'}`}>
            {name}
          </p>
        )}
        {dancer?.memberNumber && (
          <p className={`text-sm font-mono mt-1 ${bright ? 'text-gray-400' : 'text-white/60'}`}>
            {dancer.memberNumber}
          </p>
        )}
        {isTrial && (
          <span className="mt-3 inline-block text-xs font-semibold bg-white/20 text-white px-3 py-1 rounded-full">
            Cours d'essai
          </span>
        )}
      </div>
    </div>
  );
}
