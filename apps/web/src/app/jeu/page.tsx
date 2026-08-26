'use client';

import { useRouter } from 'next/navigation';

export default function JeuPage() {
  const router = useRouter();

  const go = (isDancer: boolean) => router.push(`/jeu/inscription?adherent=${isDancer ? '1' : '0'}`);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-sm mx-auto px-4 py-10">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">CDCV</h1>
          <p className="text-gray-500 text-sm mt-1">Club de Danse Coublevie / Voiron</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-1">Tirage au sort</h2>
          <p className="text-sm text-gray-500 mb-6">
            Tente ta chance et gagne une <span className="font-semibold text-gray-700">saison gratuite</span> !
          </p>

          <p className="text-sm font-medium text-gray-700 mb-4">Es-tu déjà adhérent(e) du CDCV ?</p>

          <div className="space-y-3">
            <button
              onClick={() => go(true)}
              className="w-full bg-cardTeal text-white font-semibold py-3 rounded-lg hover:bg-cardTealDark transition-colors text-sm"
            >
              Oui, je suis adhérent(e)
            </button>
            <button
              onClick={() => go(false)}
              className="w-full bg-orange text-white font-semibold py-3 rounded-lg hover:bg-orangeDark transition-colors text-sm"
            >
              Non, je découvre le club
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
