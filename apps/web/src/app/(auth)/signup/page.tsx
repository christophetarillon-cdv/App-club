'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { signUpWithEmail, signUpTrial } from '@/lib/auth';

export default function SignupPage() {
  const router = useRouter();
  const [isTrial, setIsTrial] = useState(false);
  const [trialMaxSessions, setTrialMaxSessions] = useState(3);
  const [trialMaxDays, setTrialMaxDays] = useState(30);
  const [form, setForm] = useState({
    displayName: '', firstName: '', lastName: '', email: '', password: '', confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.trialMaxSessions) setTrialMaxSessions(data.trialMaxSessions);
        if (data.trialMaxDays) setTrialMaxDays(data.trialMaxDays);
      }
    });
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    if (form.password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    setLoading(true);
    try {
      if (isTrial) {
        await signUpTrial(
          form.displayName.trim(),
          form.firstName.trim(),
          form.lastName.trim(),
          form.email.trim(),
          form.password,
          trialMaxDays,
        );
      } else {
        await signUpWithEmail(
          form.displayName.trim(),
          form.firstName.trim(),
          form.lastName.trim(),
          form.email.trim(),
          form.password,
        );
      }
      router.replace('/profile');
    } catch (err: any) {
      setError(
        err.code === 'auth/email-already-in-use'
          ? 'Cet email est déjà utilisé.'
          : 'Une erreur est survenue lors de la création du compte.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">CDV</h1>
        <p className="text-gray-500 text-sm mt-1">Club de Danse Voiron / Coublevie</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-5">Créer un compte</h2>

        {/* Toggle Membre / Cours d'essai */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Type d'inscription
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setIsTrial(false)}
              className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                !isTrial
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              Membre
            </button>
            <button type="button" onClick={() => setIsTrial(true)}
              className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                isTrial
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              Cours d'essai
            </button>
          </div>
          {isTrial && (
            <p className="text-xs text-orange-600 mt-2 bg-orange-50 rounded-lg px-3 py-2">
              Accès à {trialMaxSessions} séance{trialMaxSessions > 1 ? 's' : ''} d'essai pendant {trialMaxDays} jours. Vous pourrez rejoindre le club ensuite.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Nom du compte
            </label>
            <input type="text" value={form.displayName} onChange={set('displayName')} required
              placeholder="Ex : Marie Dupont ou Famille Martin"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            <p className="text-xs text-gray-400 mt-1">Affiché dans l'application</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Prénom</label>
              <input type="text" value={form.firstName} onChange={set('firstName')} required autoComplete="given-name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom</label>
              <input type="text" value={form.lastName} onChange={set('lastName')} required autoComplete="family-name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-2">Premier danseur lié à ce compte</p>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
            <input type="email" value={form.email} onChange={set('email')} required autoComplete="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mot de passe</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={set('password')}
                required autoComplete="new-password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              <button type="button" onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                {showPassword ? 'Masquer' : 'Voir'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Confirmer</label>
            <input type={showPassword ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')}
              required autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={loading}
            className={`w-full text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors text-sm ${
              isTrial ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}>
            {loading ? 'Création…' : isTrial ? "Commencer l'essai" : 'Créer mon compte'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Déjà un compte ?{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
