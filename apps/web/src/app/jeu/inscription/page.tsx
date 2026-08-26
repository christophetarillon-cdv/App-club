'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function InscriptionContent() {
  const router = useRouter();
  const params = useSearchParams();
  const isDancer = params.get('adherent') === '1';

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = nom.trim() !== '' && prenom.trim() !== '' && email.trim() !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;

    setLoading(true);
    setError(null);

    try {
      await addDoc(collection(db, 'raffleEntries'), {
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: email.trim().toLowerCase(),
        isDancer,
        hasWon: false,
        createdAt: serverTimestamp(),
      });
      router.push('/jeu/confirmation');
    } catch (err) {
      console.error('raffleEntries create failed:', err);
      setError('Une erreur est survenue. Réessayez.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-sm mx-auto px-4 py-10">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">CDCV</h1>
          <p className="text-gray-500 text-sm mt-1">Club de Danse Coublevie / Voiron</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Inscription au tirage</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)} required autoComplete="family-name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Prénom</label>
              <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)} required autoComplete="given-name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button type="submit" disabled={!valid || loading}
              className="w-full bg-orange text-white font-semibold py-2.5 rounded-lg hover:bg-orangeDark disabled:opacity-40 transition-colors text-sm">
              {loading ? 'Inscription…' : 'Je participe au tirage au sort'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-4 leading-relaxed">
            Vos informations sont utilisées uniquement pour ce tirage au sort et ne seront pas partagées.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function InscriptionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>
    }>
      <InscriptionContent />
    </Suspense>
  );
}
