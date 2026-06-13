'use client';

import QRCode from 'react-qr-code';

const WELCOME_URL = typeof window !== 'undefined'
  ? `${window.location.origin}/welcome`
  : '/welcome';

export default function WelcomeQrPage() {
  const handlePrint = () => window.print();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">QR code d'accueil</h1>
      <p className="text-gray-500 text-sm mb-6">
        Affichez ce QR code à l'entrée du club. Les visiteurs le scannent pour créer leur accès essai.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-sm">
        <div className="flex justify-center mb-4">
          <QRCode value={WELCOME_URL} size={220} />
        </div>
        <p className="text-center text-xs text-gray-400 break-all font-mono">{WELCOME_URL}</p>
        <button onClick={handlePrint}
          className="mt-5 w-full border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm print:hidden">
          Imprimer
        </button>
      </div>
    </div>
  );
}
