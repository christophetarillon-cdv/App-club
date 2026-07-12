'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function KioskSettingsPage() {
  const [exitCode, setExitCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      setExitCode(snap.data()?.kioskExitCode ?? '');
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    await setDoc(doc(db, 'appSettings', 'main'), { kioskExitCode: exitCode.trim() }, { merge: true });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Kiosque</h1>
      <p className="text-sm text-gray-500 mb-6">
        Code demandé sur l'application mobile avant de pouvoir quitter le kiosque de pointage
        (bouton "Retour à l'application") pendant une session de scan active.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Code de sortie du kiosque</label>
            <input type="text" inputMode="numeric" value={exitCode} onChange={e => setExitCode(e.target.value)}
              placeholder="ex : 1234"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            <p className="text-xs text-gray-400 mt-1">Laisse vide pour désactiver la demande de code.</p>
          </div>

          {saved && <p className="text-sm text-green-600">Enregistré.</p>}

          <button onClick={handleSave} disabled={saving}
            className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  );
}
