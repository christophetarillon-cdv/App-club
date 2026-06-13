'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface TrialSettings {
  trialMaxSessions: number;
  trialMaxDays: number;
  welcomeMessage: string;
  welcomeSubMessage: string;
}

const defaults: TrialSettings = { trialMaxSessions: 3, trialMaxDays: 30, welcomeMessage: '', welcomeSubMessage: '' };

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

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Séances max</label>
            <input type="number" min={1} max={20} value={form.trialMaxSessions}
              onChange={e => setForm(p => ({ ...p, trialMaxSessions: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            <p className="text-xs text-gray-400 mt-1">Nombre de séances autorisées pendant l'essai.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Durée max (jours)</label>
            <input type="number" min={1} max={365} value={form.trialMaxDays}
              onChange={e => setForm(p => ({ ...p, trialMaxDays: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            <p className="text-xs text-gray-400 mt-1">L'accès expire après ce nombre de jours.</p>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Message d'accueil (page /welcome)</label>
          <input type="text" value={form.welcomeMessage} onChange={e => setForm(p => ({ ...p, welcomeMessage: e.target.value }))} placeholder="Bienvenue au club !"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Sous-message</label>
          <textarea value={form.welcomeSubMessage} onChange={e => setForm(p => ({ ...p, welcomeSubMessage: e.target.value }))} rows={2} placeholder="Description courte de l'offre d'essai…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
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
