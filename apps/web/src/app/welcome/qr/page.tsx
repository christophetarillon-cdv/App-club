'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import QRCode from 'react-qr-code';

function QrContent() {
  const params = useSearchParams();
  const uid = params.get('dancerId') ?? '';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Bienvenue !</h1>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Votre accès visiteur est créé. Présentez ce QR code à l'accueil lors de votre première séance.
        </p>

        {uid ? (
          <div className="flex justify-center p-4 bg-white border border-gray-200 rounded-xl">
            <QRCode value={uid} size={180} />
          </div>
        ) : (
          <div className="h-44 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm">
            QR code indisponible
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 font-mono break-all">{uid}</p>

        <a href="/profile"
          className="mt-6 block w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors text-sm">
          Accéder à mon espace
        </a>
      </div>
    </div>
  );
}

export default function WelcomeQrPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>}>
      <QrContent />
    </Suspense>
  );
}
