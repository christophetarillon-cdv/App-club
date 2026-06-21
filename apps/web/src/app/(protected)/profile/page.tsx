'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { ProfileFieldsConfig } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS } from '@cdv/types';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { logout, createDancer, updateDancer, deleteDancer } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Dancer } from '@cdv/types';

// ── Formulaire danseur (ajout / édition) ──────────────────────────────────────

function DancerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { firstName: string; lastName: string };
  onSave: (firstName: string, lastName: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try { await onSave(firstName.trim(), lastName.trim()); }
    catch { setError('Erreur lors de la sauvegarde.'); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-3 border-t border-gray-100 mt-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Prénom</label>
          <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nom</label>
          <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
          {saving ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 border border-gray-300 text-gray-600 font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm">
          Annuler
        </button>
      </div>
    </form>
  );
}

// ── Carte danseur ─────────────────────────────────────────────────────────────

const roleLabel: Record<string, string> = {
  member: 'Membre', trial: 'Essai', instructor: 'Moniteur',
};

function DancerCard({
  dancer,
  accountId,
}: {
  dancer: Dancer;
  accountId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async (firstName: string, lastName: string) => {
    await updateDancer(dancer.id, { firstName, lastName });
    setEditing(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await deleteDancer(accountId, dancer.id); }
    finally { setDeleting(false); setConfirmDelete(false); }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {dancer.photoUrl ? (
            <img src={dancer.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
              {dancer.firstName[0]}{dancer.lastName[0]}
            </div>
          )}
          <div>
            <p className="font-medium text-gray-900 text-sm">{dancer.firstName} {dancer.lastName}</p>
            <div className="flex gap-1 mt-0.5">
              {dancer.roles.map(r => (
                <span key={r} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
                  {roleLabel[r] ?? r}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/dancer/${dancer.id}`}
            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
            Espace perso
          </Link>
          <button onClick={() => { setEditing(e => !e); setConfirmDelete(false); }}
            className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100">
            Modifier
          </button>
          <button onClick={() => { setConfirmDelete(c => !c); setEditing(false); }}
            className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
            Supprimer
          </button>
        </div>
      </div>

      {editing && (
        <DancerForm
          initial={{ firstName: dancer.firstName, lastName: dancer.lastName }}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      )}

      {confirmDelete && (
        <div className="mt-3 pt-3 border-t border-red-100">
          <p className="text-sm text-red-600 mb-2">Supprimer {dancer.firstName} {dancer.lastName} ?</p>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 bg-red-600 text-white font-semibold py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm">
              {deleting ? 'Suppression…' : 'Confirmer'}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="flex-1 border border-gray-300 text-gray-600 font-semibold py-1.5 rounded-lg hover:bg-gray-50 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

function mergeWithDefaults(saved: Partial<ProfileFieldsConfig> | undefined): ProfileFieldsConfig {
  const result = { ...DEFAULT_PROFILE_FIELDS };
  if (saved) {
    for (const key of Object.keys(DEFAULT_PROFILE_FIELDS) as (keyof ProfileFieldsConfig)[]) {
      if (saved[key]) result[key] = { ...DEFAULT_PROFILE_FIELDS[key], ...saved[key] };
    }
  }
  return result;
}

export default function ProfilePage() {
  const { user, account, dancers } = useAuth();
  const router = useRouter();

  const [fieldConfig, setFieldConfig] = useState<ProfileFieldsConfig>(DEFAULT_PROFILE_FIELDS);
  const [accountForm, setAccountForm] = useState({
    displayName: '', phone: '', marketingConsent: false, imageRightsConsent: false,
  });
  const [savingAccount, setSavingAccount] = useState(false);
  const [savedAccount, setSavedAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [showAddDancer, setShowAddDancer] = useState(false);

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);

  const hasEmailProvider = user?.providerData.some(p => p.providerId === 'password') ?? false;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { setPwError('Les mots de passe ne correspondent pas.'); return; }
    if (pwForm.next.length < 6) { setPwError('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (!user?.email) return;
    setSavingPw(true); setPwError(null); setPwSaved(false);
    try {
      const credential = EmailAuthProvider.credential(user.email, pwForm.current);
      await reauthenticateWithCredential(auth.currentUser!, credential);
      await updatePassword(auth.currentUser!, pwForm.next);
      setPwForm({ current: '', next: '', confirm: '' });
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err: any) {
      setPwError(
        err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
          ? 'Mot de passe actuel incorrect.'
          : 'Erreur lors du changement de mot de passe.'
      );
    } finally {
      setSavingPw(false);
    }
  };

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      if (snap.exists()) setFieldConfig(mergeWithDefaults(snap.data().profileFields));
    });
  }, []);

  useEffect(() => {
    if (account) {
      setAccountForm({
        displayName: account.displayName,
        phone: account.phone ?? '',
        marketingConsent: account.marketingConsent ?? false,
        imageRightsConsent: account.imageRightsConsent ?? false,
      });
    }
  }, [account?.uid]);

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingAccount(true); setAccountError(null); setSavedAccount(false);
    try {
      const updates: Record<string, unknown> = {
        displayName: accountForm.displayName.trim(),
        updatedAt: serverTimestamp(),
      };
      if (fieldConfig.phone.enabled) updates.phone = accountForm.phone.trim();
      if (fieldConfig.marketingConsent.enabled) updates.marketingConsent = accountForm.marketingConsent;
      if (fieldConfig.imageRightsConsent.enabled) updates.imageRightsConsent = accountForm.imageRightsConsent;
      await updateDoc(doc(db, 'accounts', user.uid), updates);
      setSavedAccount(true);
    } catch { setAccountError('Erreur lors de la sauvegarde.'); }
    finally { setSavingAccount(false); }
  };

  const handleAddDancer = async (firstName: string, lastName: string) => {
    if (!user) return;
    await createDancer(user.uid, { firstName, lastName });
    setShowAddDancer(false);
  };

  const handleLogout = async () => { await logout(); router.replace('/login'); };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto pt-8 space-y-4">

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Paramètres du compte</h1>
          <Link
            href={dancers.length === 1 ? `/dancer/${dancers[0]!.id}` : '/select-dancer'}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Espace danseur →
          </Link>
        </div>

        {/* Bandeau photo manquante */}
        {dancers.some(d => !d.photoUrl) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-800">Ajoutez une photo pour faciliter votre émargement</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Votre photo s'affiche lors du pointage au kiosque.{' '}
                {dancers.filter(d => !d.photoUrl).map((d, i) => (
                  <Link key={d.id} href={`/dancer/${d.id}/profile`} className="underline font-medium">
                    {i > 0 ? ', ' : ''}{d.firstName}
                  </Link>
                ))}
              </p>
            </div>
          </div>
        )}

        {/* Compte */}
        <form onSubmit={handleAccountSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Mon compte</h2>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom affiché</label>
            <input type="text" value={accountForm.displayName}
              onChange={e => setAccountForm(p => ({ ...p, displayName: e.target.value }))} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
          {fieldConfig.phone.enabled && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Téléphone{fieldConfig.phone.required && ' *'}
              </label>
              <input type="tel" value={accountForm.phone}
                onChange={e => setAccountForm(p => ({ ...p, phone: e.target.value }))}
                required={fieldConfig.phone.required}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
            <input type="email" value={account?.email ?? ''} disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
          </div>
          {(fieldConfig.marketingConsent.enabled || fieldConfig.imageRightsConsent.enabled) && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Consentements</p>
              {fieldConfig.marketingConsent.enabled && (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={accountForm.marketingConsent}
                    onChange={e => setAccountForm(p => ({ ...p, marketingConsent: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    Consentement marketing
                    {fieldConfig.marketingConsent.required && <span className="text-red-500 ml-0.5">*</span>}
                  </span>
                </label>
              )}
              {fieldConfig.imageRightsConsent.enabled && (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={accountForm.imageRightsConsent}
                    onChange={e => setAccountForm(p => ({ ...p, imageRightsConsent: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    Droits à l'image
                    {fieldConfig.imageRightsConsent.required && <span className="text-red-500 ml-0.5">*</span>}
                  </span>
                </label>
              )}
            </div>
          )}
          {accountError && <p className="text-red-600 text-sm">{accountError}</p>}
          {savedAccount && <p className="text-green-600 text-sm">Compte mis à jour.</p>}
          <button type="submit" disabled={savingAccount}
            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
            {savingAccount ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
        </form>

        {/* Mot de passe */}
        {hasEmailProvider && (
          <form onSubmit={handlePasswordSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Mot de passe</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mot de passe actuel</label>
              <input type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nouveau mot de passe</label>
              <input type="password" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Confirmer le mot de passe</label>
              <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            {pwError && <p className="text-red-600 text-sm">{pwError}</p>}
            {pwSaved && <p className="text-green-600 text-sm">Mot de passe mis à jour.</p>}
            <button type="submit" disabled={savingPw}
              className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
              {savingPw ? 'Mise à jour…' : 'Changer le mot de passe'}
            </button>
          </form>
        )}

        {/* Danseurs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Mes danseurs</h2>
            <button onClick={() => setShowAddDancer(v => !v)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              {showAddDancer ? 'Annuler' : '+ Ajouter'}
            </button>
          </div>

          {showAddDancer && (
            <DancerForm onSave={handleAddDancer} onCancel={() => setShowAddDancer(false)} />
          )}

          {dancers.length === 0 && !showAddDancer && (
            <p className="text-sm text-gray-400 text-center py-4">Aucun danseur enregistré.</p>
          )}

          {dancers.map(dancer => (
            <DancerCard key={dancer.id} dancer={dancer} accountId={user?.uid ?? ''} />
          ))}
        </div>

        {/* Moniteur */}
        {dancers.some(d => d.roles.includes('instructor') && !d.roles.includes('admin')) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Moniteur</h2>
            {[
              { href: '/instructor', label: 'Mes séances & présences' },
              { href: '/kiosk/setup', label: 'Ouvrir le kiosque de pointage' },
            ].map(({ href, label }) => (
              <Link key={href} href={href}
                className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                <span className="text-sm font-medium text-gray-800">{label}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}

        {/* Administration */}
        {(account?.roles?.includes('admin') || dancers.some(d => d.roles.includes('admin'))) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Administration</h2>
            <div className="space-y-2">
              {[
                { href: '/instructor', label: 'Séances & présences (vue moniteur)' },
                { href: '/admin/club-settings', label: 'Paramètres du club' },
                { href: '/admin/seasons', label: 'Saisons' },
                { href: '/admin/dance-styles', label: 'Styles de danse' },
                { href: '/admin/levels', label: 'Niveaux' },
                { href: '/admin/rooms', label: 'Salles' },
                { href: '/admin/courses', label: 'Cours' },
                { href: '/admin/interruptions', label: 'Interruptions' },
                { href: '/admin/public-holidays', label: 'Jours fériés' },
                { href: '/admin/pricing-plans', label: 'Tarifs' },
                { href: '/admin/payment-plans', label: 'Plans de paiement' },
                { href: '/admin/payments/new', label: 'Saisir un paiement' },
                { href: '/admin/payments/cheques', label: 'Chèques' },
                { href: '/admin/payments/bank-deposits/new', label: 'Bordereau de remise' },
                { href: '/admin/settings/planning', label: 'Paramètres planning' },
                { href: '/admin/settings/trial', label: 'Paramètres essai' },
                { href: '/admin/settings/welcome-qr', label: "QR d'accueil" },
                { href: '/kiosk/setup', label: 'Ouvrir le kiosque de pointage' },
                { href: '/admin/media', label: 'Médiathèque (admin)' },
                { href: '/admin/notification-channels', label: 'Canaux de notification' },
                { href: '/admin/notifications/send', label: 'Envoyer une notification' },
                { href: '/admin/chat-channels', label: 'Canaux de chat' },
                { href: '/admin/private-messages', label: 'Messages privés' },
              ].map(({ href, label }) => (
                <Link key={href} href={href}
                  className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <span className="text-sm font-medium text-gray-800">{label}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleLogout}
          className="w-full border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm">
          Se déconnecter
        </button>

      </div>
    </div>
  );
}
