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
          <Link href="/select-dancer"
            className={`block w-full font-semibold py-2.5 rounded-lg transition-colors text-sm ${
              type === 'member'
                ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}>
            Accéder à mon espace
          </Link>
        </div>

        {/* Téléchargement de l'application mobile */}
        <div className="mt-6 pt-5 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            📱 Téléchargez l'application
          </p>
          <p className="text-sm text-gray-600 mb-3">
            Retrouvez votre planning, votre QR code et le chat du club directement sur votre téléphone.
          </p>
          <div className="flex gap-2">
            <a href="https://apps.apple.com/fr/app/cdcv/id6790001972" target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-800 shrink-0" fill="currentColor">
                <path d="M16.365 1.43c0 1.14-.415 2.07-1.246 2.79-.83.72-1.79 1.11-2.88 1.02-.045-1.05.36-2.04 1.155-2.79.795-.75 1.83-1.14 3.06-.99 0-.01-.045-.02-.09-.03zM20.25 17.09c-.63 1.44-.945 2.07-1.755 3.33-1.14 1.77-2.745 3.99-4.725 4.005-1.77.015-2.235-1.155-4.635-1.14-2.4.015-2.925 1.17-4.71 1.155-1.98-.015-3.495-2.01-4.635-3.78C-1.68 15.985-.63 8.5 3.15 4.6c1.845-1.905 4.02-2.115 5.475-2.115 1.53 0 2.475 1.155 4.605 1.155 2.07 0 2.685-1.155 4.605-1.155 1.29 0 3.435.15 5.13 2.4-4.335 2.475-3.615 8.86 2.55 12.2-.135.24-.735 1.845-1.265 2.005z"/>
              </svg>
              <span className="text-left leading-tight">
                <span className="block text-[9px] text-gray-500">Télécharger sur</span>
                <span className="block text-xs font-semibold text-gray-900">App Store</span>
              </span>
            </a>
            <a href="https://play.google.com/store/apps/details?id=fr.clubdansecoublevievoiron.app" target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
                <path d="M3.6 2.65a1.5 1.5 0 00-.6 1.2v16.3a1.5 1.5 0 00.6 1.2l.09.06L13.5 12 3.7 2.59z" fill="#00d4ff"/>
                <path d="M16.9 15.4l-3.4-3.4 3.4-3.4 4.05 2.34c.9.52.9 1.6 0 2.12z" fill="#ffcf00"/>
                <path d="M13.5 12L3.7 2.59a1.13 1.13 0 011.15-.02l11.65 6.72z" fill="#00f076"/>
                <path d="M13.5 12l3.4 3.4-11.65 6.72a1.13 1.13 0 01-1.15-.02z" fill="#ff3a44"/>
              </svg>
              <span className="text-left leading-tight">
                <span className="block text-[9px] text-gray-500">Disponible sur</span>
                <span className="block text-xs font-semibold text-gray-900">Google Play</span>
              </span>
            </a>
          </div>
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
