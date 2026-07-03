'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { logout } from '@/lib/auth';

export default function ForcePasswordChangePage() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (next.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (next !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }

    const email = auth.currentUser?.email;
    if (!email || !auth.currentUser) return;

    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(email, current);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, next);
      await updateDoc(doc(db, 'accounts', auth.currentUser.uid), { mustChangePassword: false });
      router.replace('/select-dancer');
    } catch (err: any) {
      setError(
        err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
          ? 'Mot de passe actuel incorrect.'
          : 'Erreur lors du changement de mot de passe.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">CDV</h1>
        <p className="text-gray-500 text-sm mt-1">Club de Danse Voiron / Coublevie</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Changement de mot de passe requis</h2>
        <p className="text-sm text-gray-500 mb-6">
          Pour des raisons de sécurité, vous devez choisir un nouveau mot de passe avant de continuer.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mot de passe provisoire</label>
            <input
              type="password" value={current} onChange={e => setCurrent(e.target.value)} required autoComplete="current-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nouveau mot de passe</label>
            <input
              type="password" value={next} onChange={e => setNext(e.target.value)} required autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Confirmer le mot de passe</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
            {saving ? 'Enregistrement…' : 'Valider le nouveau mot de passe'}
          </button>
        </form>

        <button onClick={() => logout()} className="w-full text-center text-xs text-gray-400 hover:text-gray-600 mt-4">
          Se déconnecter
        </button>
      </div>
    </div>
    </div>
  );
}
