'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import Link from 'next/link';

interface RoleOption { key: string; label: string; }

interface DancerFormRow {
  firstName: string;
  lastName: string;
  role: string;
  birthDate: string;
  gender: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

interface AdminCreateAccountResult {
  uid: string;
  dancerIds: string[];
  generatedPassword: string | null;
}

const emptyDancer = (defaultRole: string): DancerFormRow => ({
  firstName: '', lastName: '', role: defaultRole,
  birthDate: '', gender: '', address: '', emergencyContactName: '', emergencyContactPhone: '',
});

export default function AdminNewAccountPage() {
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [dancers, setDancers] = useState<DancerFormRow[]>([emptyDancer('')]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminCreateAccountResult | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'roles'), orderBy('displayOrder'))).then(snap => {
      const options = snap.docs.map(d => ({ key: d.data().key, label: d.data().label })).filter(r => r.key !== 'admin');
      setRoleOptions(options);
      const defaultRole = options.find(r => r.key === 'member')?.key ?? options[0]?.key ?? '';
      setDancers([emptyDancer(defaultRole)]);
    });
  }, []);

  const defaultRole = roleOptions.find(r => r.key === 'member')?.key ?? roleOptions[0]?.key ?? '';

  const updateDancer = (index: number, patch: Partial<DancerFormRow>) => {
    setDancers(prev => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const addDancer = () => setDancers(prev => [...prev, emptyDancer(defaultRole)]);
  const removeDancer = (index: number) => setDancers(prev => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const call = httpsCallable(functions, 'adminCreateAccount');
      const res = await call({
        email: email.trim(),
        password: password.trim() || undefined,
        phone: phone.trim() || undefined,
        dancers: dancers.map(d => ({
          firstName: d.firstName.trim(), lastName: d.lastName.trim(), role: d.role,
          birthDate: d.birthDate || undefined,
          gender: d.gender || undefined,
          address: d.address.trim() || undefined,
          emergencyContactName: d.emergencyContactName.trim() || undefined,
          emergencyContactPhone: d.emergencyContactPhone.trim() || undefined,
        })),
      });
      setResult(res.data as AdminCreateAccountResult);
      setEmail('');
      setPassword('');
      setPhone('');
      setDancers([emptyDancer(defaultRole)]);
    } catch (err) {
      const message = (err as { message?: string })?.message ?? 'Erreur lors de la création du compte';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/dancers" className="text-sm text-gray-400 hover:text-gray-700">← Danseurs</Link>
        <h1 className="text-2xl font-bold text-gray-900">Créer un compte</h1>
      </div>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-green-700 font-medium">Compte créé avec succès.</p>
          {result.generatedPassword && (
            <p className="text-sm text-green-700 mt-1">
              Mot de passe provisoire généré : <span className="font-mono font-semibold">{result.generatedPassword}</span>
              <br />
              <span className="text-xs text-green-600">À communiquer à la famille — un changement sera demandé à la première connexion.</span>
            </p>
          )}
          <button onClick={() => setResult(null)} className="text-xs text-green-600 underline mt-2">Créer un autre compte</button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!result && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email du compte</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="famille@exemple.fr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Téléphone (facultatif)
            </label>
            <input
              type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="06 12 34 56 78"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Mot de passe provisoire (facultatif)
            </label>
            <input
              type="text" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Laisser vide pour générer automatiquement (email + nom)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <p className="text-xs text-gray-400 mt-1">
              Un changement de mot de passe sera de toute façon demandé à la première connexion.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Danseur(s)</label>
              <button type="button" onClick={addDancer} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                + Ajouter un danseur
              </button>
            </div>
            <div className="space-y-3">
              {dancers.map((d, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Prénom</label>
                    <input
                      type="text" required value={d.firstName}
                      onChange={e => updateDancer(i, { firstName: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Nom</label>
                    <input
                      type="text" required value={d.lastName}
                      onChange={e => updateDancer(i, { lastName: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Rôle</label>
                    <select
                      required value={d.role} onChange={e => updateDancer(i, { role: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="">Choisir…</option>
                      {roleOptions.map(r => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  {dancers.length > 1 && (
                    <button
                      type="button" onClick={() => removeDancer(i)}
                      className="text-xs text-red-500 hover:text-red-700 h-9"
                    >
                      Retirer
                    </button>
                  )}

                  <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2 mt-1 border-t border-gray-100">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Date de naissance</label>
                      <input
                        type="date" value={d.birthDate}
                        onChange={e => updateDancer(i, { birthDate: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Genre</label>
                      <select
                        value={d.gender} onChange={e => updateDancer(i, { gender: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="">— Choisir —</option>
                        <option value="male">Homme</option>
                        <option value="female">Femme</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Adresse</label>
                      <input
                        type="text" value={d.address}
                        onChange={e => updateDancer(i, { address: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-1">Contact urgence (nom)</label>
                        <input
                          type="text" value={d.emergencyContactName}
                          onChange={e => updateDancer(i, { emergencyContactName: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-1">Contact urgence (tél.)</label>
                        <input
                          type="tel" value={d.emergencyContactPhone}
                          onChange={e => updateDancer(i, { emergencyContactPhone: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit" disabled={saving}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Création…' : 'Créer le compte'}
          </button>
        </form>
      )}
    </div>
  );
}
