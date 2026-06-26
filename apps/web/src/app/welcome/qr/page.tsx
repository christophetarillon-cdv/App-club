'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import QRCode from 'react-qr-code';
import Link from 'next/link';

function QrContent() {
  const params = useSearchParams();
  // Compatibilité ancien format (?dancerId=) et nouveau (?dancerIds=id1,id2)
  const rawIds = params.get('dancerIds') ?? params.get('dancerId') ?? '';
  const type = (params.get('type') ?? 'trial') as 'trial' | 'member';
  const dancerIds = rawIds.split(',').filter(Boolean);

  const [activeIdx, setActiveIdx] = useState(0);
  const activeId = dancerIds[activeIdx] ?? '';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">

        <div className="text-4xl mb-3">🎉</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {type === 'member' ? 'Compte créé !' : 'Bienvenue !'}
        </h1>
        <p className="text-gray-500 text-sm mb-5 leading-relaxed">
          {type === 'trial'
            ? "Présentez ce QR code à l'accueil lors de votre séance d'essai."
            : "Présentez ce QR code à l'accueil pour le pointage de vos séances."
          }
        </p>

        {/* Sélecteur si plusieurs danseurs */}
        {dancerIds.length > 1 && (
          <div className="flex gap-2 justify-center mb-4">
            {dancerIds.map((_, i) => (
              <button key={i} onClick={() => setActiveIdx(i)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeIdx === i
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                Danseur {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* QR Code */}
        {activeId ? (
          <div className="flex justify-center p-4 bg-white border border-gray-200 rounded-xl">
            <QRCode value={activeId} size={180} />
          </div>
        ) : (
          <div className="h-44 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm">
            QR code indisponible
          </div>
        )}

        {/* Et ensuite */}
        <div className="mt-5 text-left bg-gray-50 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Et ensuite ?</p>
          {type === 'trial' ? (
            <>
              <p className="text-sm text-gray-600">
                Retrouvez votre QR code à tout moment depuis votre profil ou l'application mobile.
              </p>
              <p className="text-sm text-gray-600">
                Après l'essai, vous pourrez rejoindre le club comme membre.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Réglez votre cotisation pour valider votre inscription à la saison.
              </p>
              <p className="text-sm text-gray-600">
                Retrouvez votre QR code à tout moment depuis votre profil ou l'application mobile.
              </p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 space-y-2">
          {type === 'member' && (
            <Link href="/membership"
              className="block w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors text-sm">
              Régler ma cotisation →
            </Link>
          )}
          <Link href="/profile"
            className={`block w-full font-semibold py-2.5 rounded-lg transition-colors text-sm ${
              type === 'member'
                ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}>
            Accéder à mon espace
          </Link>
        </div>

      </div>
    </div>
  );
}

export default function WelcomeQrPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>
    }>
      <QrContent />
    </Suspense>
  );
}
