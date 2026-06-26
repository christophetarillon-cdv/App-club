'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { signUpWithDancers, type DancerInput } from '@/lib/auth';
import type { ProfileFieldsConfig } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS } from '@cdv/types';

function mergeWithDefaults(saved: Partial<ProfileFieldsConfig> | undefined): ProfileFieldsConfig {
  const result = { ...DEFAULT_PROFILE_FIELDS };
  if (saved) {
    for (const key of Object.keys(DEFAULT_PROFILE_FIELDS) as (keyof ProfileFieldsConfig)[]) {
      if (saved[key]) result[key] = { ...DEFAULT_PROFILE_FIELDS[key], ...saved[key] };
    }
  }
  return result;
}

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<'trial' | 'member' | null>(null);

  const [clubName, setClubName] = useState('CDV');
  const [clubDesc, setClubDesc] = useState('');
  const [trialMaxSessions, setTrialMaxSessions] = useState(3);
  const [trialMaxDays, setTrialMaxDays] = useState(30);
  const [fieldConfig, setFieldConfig] = useState<ProfileFieldsConfig>(DEFAULT_PROFILE_FIELDS);

  const [dancers, setDancers] = useState<DancerInput[]>([{ firstName: '', lastName: '' }]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [phone, setPhone] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [imageRightsConsent, setImageRightsConsent] = useState(false);

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
        if (d.trialMaxSessions) setTrialMaxSessions(d.trialMaxSessions);
        if (d.trialMaxDays) setTrialMaxDays(d.trialMaxDays);
        setFieldConfig(mergeWithDefaults(d.profileFields));
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

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!step1Valid) return;
    setStep(2);
    setError(null);
  };

  const handleSubmit = async (selectedType: 'trial' | 'member') => {
    if (selectedType === 'member') {
      if (fieldConfig.phone.enabled && fieldConfig.phone.required && !phone.trim()) {
        setError('Le téléphone est requis.'); return;
      }
      if (fieldConfig.marketingConsent.enabled && fieldConfig.marketingConsent.required && !marketingConsent) {
        setError('Le consentement marketing est requis.'); return;
      }
      if (fieldConfig.imageRightsConsent.enabled && fieldConfig.imageRightsConsent.required && !imageRightsConsent) {
        setError("L'accord sur les droits à l'image est requis."); return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const options = selectedType === 'member' ? {
        phone: fieldConfig.phone.enabled && phone.trim() ? phone.trim() : undefined,
        marketingConsent: fieldConfig.marketingConsent.enabled ? marketingConsent : undefined,
        imageRightsConsent: fieldConfig.imageRightsConsent.enabled ? imageRightsConsent : undefined,
      } : undefined;

      const { dancerIds } = await signUpWithDancers(
        dancers,
        email.trim(),
        password,
        selectedType,
        { trialMaxDays: selectedType === 'trial' ? trialMaxDays : undefined, options },
      );

      const params = new URLSearchParams({ dancerIds: dancerIds.join(','), type: selectedType });
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

  const namesLabel = dancers
    .filter(d => d.firstName.trim())
    .map(d => `${d.firstName.trim()} ${d.lastName.trim()}`.trim())
    .join(' et ');

  const hasExtraFields = type === 'member' &&
    (fieldConfig.phone.enabled || fieldConfig.marketingConsent.enabled || fieldConfig.imageRightsConsent.enabled);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-sm mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{clubName}</h1>
          {clubDesc && <p className="text-gray-500 text-sm mt-1">{clubDesc}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">

          {/* ── ÉTAPE 1 ── */}
          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold text-gray-800 mb-5">Créer un compte</h2>

              <form onSubmit={handleStep1} className="space-y-4">

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

                <button type="submit" disabled={!step1Valid}
                  className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors text-sm">
                  Continuer →
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-4">
                Déjà un compte ?{' '}
                <a href="/login" className="text-blue-600 hover:underline font-medium">Se connecter</a>
              </p>
            </>
          )}

          {/* ── ÉTAPE 2 ── */}
          {step === 2 && (
            <>
              <button type="button" onClick={() => { setStep(1); setType(null); setError(null); }}
                className="text-sm text-gray-400 hover:text-gray-600 mb-4 block">
                ← Retour
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-1">Type d'inscription</h2>
              {namesLabel && (
                <p className="text-sm text-gray-500 mb-5">Pour {namesLabel}</p>
              )}

              <div className="space-y-3">

                {/* Essai */}
                <button type="button" onClick={() => setType('trial')}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                    type === 'trial' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">Période d'essai</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {trialMaxSessions} séance{trialMaxSessions > 1 ? 's' : ''} · {trialMaxDays} jours · gratuit
                      </p>
                    </div>
                    <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      type === 'trial' ? 'border-orange-400 bg-orange-400' : 'border-gray-300'
                    }`}>
                      {type === 'trial' && (
                        <svg viewBox="0 0 12 12" fill="white" className="w-3 h-3">
                          <path d="M1.5 6l3 3 6-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                        </svg>
                      )}
                    </span>
                  </div>
                </button>

                {/* Membre */}
                <button type="button" onClick={() => setType('member')}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                    type === 'member' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">Devenir membre</p>
                      <p className="text-sm text-gray-500 mt-0.5">Accès complet à la saison</p>
                    </div>
                    <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      type === 'member' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}>
                      {type === 'member' && (
                        <svg viewBox="0 0 12 12" fill="white" className="w-3 h-3">
                          <path d="M1.5 6l3 3 6-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                        </svg>
                      )}
                    </span>
                  </div>
                </button>
              </div>

              {/* Champs supplémentaires membre */}
              {hasExtraFields && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  {fieldConfig.phone.enabled && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Téléphone{fieldConfig.phone.required ? ' *' : ''}
                      </label>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                        required={fieldConfig.phone.required}
                        autoComplete="tel"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                    </div>
                  )}
                  {fieldConfig.marketingConsent.enabled && (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={marketingConsent}
                        onChange={e => setMarketingConsent(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded flex-shrink-0" />
                      <span className="text-xs text-gray-600">
                        J'accepte de recevoir des communications marketing du club.
                        {fieldConfig.marketingConsent.required && <span className="text-red-500 ml-0.5">*</span>}
                      </span>
                    </label>
                  )}
                  {fieldConfig.imageRightsConsent.enabled && (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={imageRightsConsent}
                        onChange={e => setImageRightsConsent(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded flex-shrink-0" />
                      <span className="text-xs text-gray-600">
                        J'autorise le club à utiliser mon image (photos/vidéos).
                        {fieldConfig.imageRightsConsent.required && <span className="text-red-500 ml-0.5">*</span>}
                      </span>
                    </label>
                  )}
                </div>
              )}

              {error && (
                <p className="text-red-600 text-sm mt-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {type && (
                <button type="button" onClick={() => handleSubmit(type)} disabled={loading}
                  className={`mt-4 w-full text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors text-sm ${
                    type === 'trial' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'
                  }`}>
                  {loading ? 'Création…' : type === 'trial' ? "Commencer l'essai" : 'Créer mon compte'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
