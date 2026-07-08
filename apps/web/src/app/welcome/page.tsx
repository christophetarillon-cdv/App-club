'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { signUpWithDancers, type DancerInput } from '@/lib/auth';

export default function WelcomePage() {
  const router = useRouter();

  const [clubName, setClubName] = useState('CDV');
  const [clubDesc, setClubDesc] = useState('');
  const [trialMode, setTrialMode] = useState<'sessions' | 'days' | 'fixed'>('sessions');
  const [trialMaxSessions, setTrialMaxSessions] = useState(3);
  const [trialMaxDays, setTrialMaxDays] = useState(30);
  const [trialEndDate, setTrialEndDate] = useState('');

  const [dancers, setDancers] = useState<DancerInput[]>([{ firstName: '', lastName: '' }]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'clubProfile', 'main')),
      getDoc(doc(db, 'appSettings', 'main')),
    ]).then(([clubSnap, settingsSnap]) => {
      if (clubSnap.exists()) {
        const d = clubSnap.data();
        setClubName(d.shortName ?? 'CDV');
        setClubDesc(d.shortDescription ?? '');
      }
      if (settingsSnap.exists()) {
        const d = settingsSnap.data();
        if (d.trialMode) setTrialMode(d.trialMode);
        if (d.trialMaxSessions) setTrialMaxSessions(d.trialMaxSessions);
        if (d.trialMaxDays) setTrialMaxDays(d.trialMaxDays);
        if (d.trialEndDate) setTrialEndDate(d.trialEndDate);
      }
    });
  }, []);

  const updateDancer = (i: number, field: keyof DancerInput, value: string) =>
    setDancers(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d));

  const addDancer = () => {
    if (dancers.length < 3) setDancers(prev => [...prev, { firstName: '', lastName: '' }]);
  };

  const removeDancer = (i: number) =>
    setDancers(prev => prev.filter((_, idx) => idx !== i));

  const step1Valid =
    dancers.every(d => d.firstName.trim() && d.lastName.trim()) &&
    email.trim() !== '' &&
    password.length >= 6;

  // Inscription via QR code du club : toujours en essai, jamais membre
  // directement (le passage en membre se fait ensuite via l'admin).
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step1Valid) return;

    setLoading(true);
    setError(null);

    try {
      const { dancerIds } = await signUpWithDancers(
        dancers,
        email.trim(),
        password,
        'trial',
        {
          trialMode,
          trialMaxSessions,
          trialMaxDays,
          trialEndDate,
        },
      );

      const params = new URLSearchParams({ dancerIds: dancerIds.join(','), type: 'trial' });
      router.replace(`/welcome/qr?${params.toString()}`);
    } catch (err: any) {
      setError(
        err.code === 'auth/email-already-in-use'
          ? 'Cet email est déjà utilisé. Connectez-vous plutôt.'
          : 'Une erreur est survenue.',
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-sm mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{clubName}</h1>
          {clubDesc && <p className="text-gray-500 text-sm mt-1">{clubDesc}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-1">Créer un compte</h2>
          <p className="text-sm text-orange-600 font-medium mb-5">
            Période d'essai —{' '}
            {trialMode === 'sessions' && `${trialMaxSessions} séance${trialMaxSessions > 1 ? 's' : ''} gratuite${trialMaxSessions > 1 ? 's' : ''}`}
            {trialMode === 'days' && `${trialMaxDays} jour${trialMaxDays > 1 ? 's' : ''} gratuit${trialMaxDays > 1 ? 's' : ''}`}
            {trialMode === 'fixed' && trialEndDate && `jusqu'au ${new Date(trialEndDate).toLocaleDateString('fr-FR')}`}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Danseurs */}
            <div className="space-y-3">
              {dancers.map((dancer, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {dancers.length > 1 ? `Danseur${i > 0 ? ` ${i + 1}` : ' 1'}` : 'Danseur(se)'}
                    </label>
                    {i > 0 && (
                      <button type="button" onClick={() => removeDancer(i)}
                        className="text-xs text-red-400 hover:text-red-600 font-medium">
                        Supprimer
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={dancer.firstName}
                      onChange={e => updateDancer(i, 'firstName', e.target.value)}
                      placeholder="Prénom"
                      required
                      autoComplete={i === 0 ? 'given-name' : 'off'}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <input
                      type="text"
                      value={dancer.lastName}
                      onChange={e => updateDancer(i, 'lastName', e.target.value)}
                      placeholder="Nom"
                      required
                      autoComplete={i === 0 ? 'family-name' : 'off'}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>
              ))}

              {dancers.length < 3 && (
                <button type="button" onClick={addDancer}
                  className="w-full border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                  + Ajouter un(e) danseur(se)
                </button>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Email
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>

            {/* Mot de passe */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Mot de passe
              </label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  required autoComplete="new-password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                <button type="button" onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                  {showPassword ? 'Masquer' : 'Voir'}
                </button>
              </div>
              {password.length > 0 && password.length < 6 && (
                <p className="text-xs text-red-500 mt-1">Au moins 6 caractères</p>
              )}
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={!step1Valid || loading}
              className="w-full bg-orange-500 text-white font-semibold py-2.5 rounded-lg hover:bg-orange-600 disabled:opacity-40 transition-colors text-sm">
              {loading ? 'Création…' : "Commencer l'essai"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Déjà un compte ?{' '}
            <a href="/login" className="text-blue-600 hover:underline font-medium">Se connecter</a>
          </p>
        </div>
      </div>
    </div>
  );
}
