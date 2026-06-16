'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
            {dancer.firstName[0]}{dancer.lastName[0]}
          </div>
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
          <Link href={`/profile/dancer/${dancer.id}`}
            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
            Profil
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

export default function ProfilePage() {
  const { user, account, dancers } = useAuth();
  const router = useRouter();

  const [accountForm, setAccountForm] = useState({ displayName: '', phone: '' });
  const [savingAccount, setSavingAccount] = useState(false);
  const [savedAccount, setSavedAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [showAddDancer, setShowAddDancer] = useState(false);

  useEffect(() => {
    if (account) {
      setAccountForm({ displayName: account.displayName, phone: account.phone ?? '' });
    }
  }, [account]);

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingAccount(true); setAccountError(null); setSavedAccount(false);
    try {
      await updateDoc(doc(db, 'accounts', user.uid), {
        displayName: accountForm.displayName.trim(),
        phone: accountForm.phone.trim(),
        updatedAt: serverTimestamp(),
      });
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

        <h1 className="text-2xl font-bold text-gray-900 mb-4">Mon profil</h1>

        {/* Compte */}
        <form onSubmit={handleAccountSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Mon compte</h2>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom affiché</label>
            <input type="text" value={accountForm.displayName}
              onChange={e => setAccountForm(p => ({ ...p, displayName: e.target.value }))} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Téléphone</label>
            <input type="tel" value={accountForm.phone}
              onChange={e => setAccountForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
            <input type="email" value={account?.email ?? ''} disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
          </div>
          {accountError && <p className="text-red-600 text-sm">{accountError}</p>}
          {savedAccount && <p className="text-green-600 text-sm">Compte mis à jour.</p>}
          <button type="submit" disabled={savingAccount}
            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
            {savingAccount ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
        </form>

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

        {/* Accès rapide */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Accès rapide</h2>
          {[
            { href: '/profile/card', label: 'Ma carte de membre' },
            { href: '/my-card', label: 'Mon QR code de présence' },
          { href: '/my-courses', label: 'Mes cours' },
            { href: '/membership', label: 'Ma cotisation' },
            { href: '/profile/levels', label: 'Mes niveaux par style' },
            { href: '/planning', label: 'Planning des cours' },
          ].map(({ href, label }) => (
            <Link key={href} href={href}
              className="flex items-center justify-between w-full px-4 py-3 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
              <span className="text-sm font-medium text-blue-800">{label}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        {/* Moniteur */}
        {dancers.some(d => d.roles.includes('instructor') && !d.roles.includes('admin')) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Moniteur</h2>
            <Link href="/kiosk/setup"
              className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <span className="text-sm font-medium text-gray-800">Ouvrir le kiosque de pointage</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}

        {/* Administration */}
        {(account?.roles?.includes('admin') || dancers.some(d => d.roles.includes('admin'))) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Administration</h2>
            <div className="space-y-2">
              {[
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
