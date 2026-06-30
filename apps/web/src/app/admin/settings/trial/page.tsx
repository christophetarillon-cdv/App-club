'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type TrialMode = 'sessions' | 'days' | 'fixed';

interface TrialSettings {
  trialMode: TrialMode;
  trialMaxSessions: number;
  trialMaxDays: number;
  trialEndDate: string;
  welcomeMessage: string;
  welcomeSubMessage: string;
}

const defaults: TrialSettings = {
  trialMode: 'sessions',
  trialMaxSessions: 3,
  trialMaxDays: 30,
  trialEndDate: '',
  welcomeMessage: '',
  welcomeSubMessage: '',
};

const MODES: { key: TrialMode; label: string; desc: string }[] = [
  { key: 'sessions', label: 'Nombre de séances', desc: 'L\'essai se termine après un nombre de séances défini.' },
  { key: 'days',     label: 'Nombre de jours',   desc: 'L\'essai expire X jours après l\'inscription.' },
  { key: 'fixed',    label: 'Date fixe',          desc: 'Tous les essais expirent à la même date.' },
];

export default function TrialSettingsPage() {
  const [form, setForm] = useState<TrialSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main'))
      .then(snap => { if (snap.exists()) setForm({ ...defaults, ...snap.data() }); })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaved(false);
    await setDoc(doc(db, 'appSettings', 'main'), { ...form, updatedAt: serverTimestamp() }, { merge: true });
    setSaved(true); setSaving(false);
  };

  if (loading) return <p className="text-gray-500 text-sm">Chargement…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Paramètres — Séance d'essai</h1>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Choix du mode */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Mode de fin d'essai</p>
          {MODES.map(m => (
            <label key={m.key} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
              form.trialMode === m.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input type="radio" name="trialMode" value={m.key}
                checked={form.trialMode === m.key}
                onChange={() => setForm(p => ({ ...p, trialMode: m.key }))}
                className="mt-0.5 accent-blue-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">{m.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Paramètre selon le mode */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          {form.trialMode === 'sessions' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre de séances max</label>
              <input type="number" min={1} max={20} value={form.trialMaxSessions}
                onChange={e => setForm(p => ({ ...p, trialMaxSessions: Number(e.target.value) }))}
                className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              <p className="text-xs text-gray-400 mt-1">L'essai se termine après ce nombre de séances assistées.</p>
            </div>
          )}
          {form.trialMode === 'days' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Durée (jours)</label>
              <input type="number" min={1} max={365} value={form.trialMaxDays}
                onChange={e => setForm(p => ({ ...p, trialMaxDays: Number(e.target.value) }))}
                className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              <p className="text-xs text-gray-400 mt-1">L'accès expire ce nombre de jours après l'inscription.</p>
            </div>
          )}
          {form.trialMode === 'fixed' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date de fin commune</label>
              <input type="date" value={form.trialEndDate}
                onChange={e => setForm(p => ({ ...p, trialEndDate: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              <p className="text-xs text-gray-400 mt-1">Tous les danseurs en essai perdent leur accès à cette date.</p>
            </div>
          )}
        </div>

        {/* Messages d'accueil */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Messages d'accueil</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Message principal</label>
            <input type="text" value={form.welcomeMessage} onChange={e => setForm(p => ({ ...p, welcomeMessage: e.target.value }))} placeholder="Bienvenue au club !"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Sous-message</label>
            <textarea value={form.welcomeSubMessage} onChange={e => setForm(p => ({ ...p, welcomeSubMessage: e.target.value }))} rows={2} placeholder="Description courte de l'offre d'essai…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
          </div>
        </div>

        {saved && <p className="text-green-600 text-sm">Paramètres sauvegardés.</p>}
        <button type="submit" disabled={saving}
          className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
          {saving ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
      </form>
    </div>
  );
}
