'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { signUpTrial } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import type { AppSettings } from '@cdv/types';

interface ClubInfo { shortName: string; shortDescription: string; }

export default function WelcomePage() {
  const router = useRouter();
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [trialMaxDays, setTrialMaxDays] = useState(30);
  const [form, setForm] = useState({ displayName: '', firstName: '', lastName: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'clubProfile', 'main')),
      getDoc(doc(db, 'appSettings', 'main')),
    ]).then(([clubSnap, settingsSnap]) => {
      if (clubSnap.exists()) setClub(clubSnap.data() as ClubInfo);
      if (settingsSnap.exists()) setTrialMaxDays((settingsSnap.data() as AppSettings).trialMaxDays ?? 30);
    });
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    setLoading(true); setError(null);
    try {
      const { dancerId } = await signUpTrial(
        form.displayName.trim(),
        form.firstName.trim(),
        form.lastName.trim(),
        form.email.trim(),
        form.password,
        trialMaxDays,
      );
      router.replace(`/welcome/qr?dancerId=${dancerId}`);
    } catch (err: any) {
      setError(
        err.code === 'auth/email-already-in-use'
          ? 'Cet email est déjà utilisé. Connectez-vous plutôt.'
          : 'Une erreur est survenue.',
      );
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{club?.shortName ?? 'Bienvenue'}</h1>
          {club?.shortDescription && <p className="text-gray-500 mt-2 text-sm leading-relaxed">{club.shortDescription}</p>}
          <div className="mt-4 inline-block bg-blue-50 text-blue-700 text-sm font-medium px-4 py-1.5 rounded-full">
            Séance d'essai gratuite — {trialMaxDays} jours
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">Créer mon accès visiteur</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Votre nom (compte)</label>
              <input type="text" value={form.displayName} onChange={set('displayName')} required placeholder="Ex : Marie Dupont ou Famille Martin"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Danseur(se) — essai</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Prénom</label>
                  <input type="text" value={form.firstName} onChange={set('firstName')} required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nom</label>
                  <input type="text" value={form.lastName} onChange={set('lastName')} required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Connexion</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={set('email')} required autoComplete="email"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Mot de passe</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={set('password')} required autoComplete="new-password"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                      {showPassword ? 'Masquer' : 'Voir'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
              {loading ? 'Création…' : 'Commencer mon essai'}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-4">
            Déjà membre ?{' '}
            <a href="/login" className="text-blue-600 hover:underline">Se connecter</a>
          </p>
        </div>
      </div>
    </div>
  );
}
