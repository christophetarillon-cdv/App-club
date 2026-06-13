'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, getDocs, collection, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PlanningSettings {
  schoolZone: 'A' | 'B' | 'C';
  cancelOnPublicHolidays: boolean;
  cancelOnPublicHolidaysOnlyDuringSchoolHolidays: boolean;
}

const defaults: PlanningSettings = {
  schoolZone: 'A',
  cancelOnPublicHolidays: true,
  cancelOnPublicHolidaysOnlyDuringSchoolHolidays: false,
};

export default function PlanningSettingsPage() {
  const [settings, setSettings] = useState<PlanningSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSettings({
          schoolZone: d.schoolZone ?? 'A',
          cancelOnPublicHolidays: d.cancelOnPublicHolidays ?? true,
          cancelOnPublicHolidaysOnlyDuringSchoolHolidays: d.cancelOnPublicHolidaysOnlyDuringSchoolHolidays ?? false,
        });
      }
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await setDoc(doc(db, 'appSettings', 'main'), {
      ...settings,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setSaving(false);
  };

  const handleRegenerate = async () => {
    if (!confirm('Recalculer les séances de tous les cours avec les paramètres actuels ?')) return;
    setRegenerating(true);
    const snap = await getDocs(collection(db, 'courses'));
    await Promise.all(snap.docs.map(d => updateDoc(d.ref, { updatedAt: serverTimestamp() })));
    setRegenerating(false);
    alert(`${snap.size} cours mis à jour. Les séances manquantes seront créées dans quelques secondes.`);
  };

  if (loading) return <p className="text-gray-500 text-sm">Chargement…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Paramètres planning</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-6 max-w-lg">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Zone scolaire</p>
          <div className="flex gap-4">
            {(['A', 'B', 'C'] as const).map(z => (
              <label key={z} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="schoolZone"
                  value={z}
                  checked={settings.schoolZone === z}
                  onChange={() => setSettings(p => ({ ...p, schoolZone: z }))}
                />
                <span className="text-sm font-medium text-gray-700">Zone {z}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Utilisée pour l'import automatique des vacances scolaires.</p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Annulation automatique des séances</p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.cancelOnPublicHolidays}
              onChange={e => setSettings(p => ({ ...p, cancelOnPublicHolidays: e.target.checked }))}
              className="mt-0.5 rounded"
            />
            <div>
              <p className="text-sm font-medium text-gray-700">Annuler les séances les jours fériés</p>
              <p className="text-xs text-gray-400">Aucune séance ne sera générée sur un jour férié.</p>
            </div>
          </label>

          {settings.cancelOnPublicHolidays && (
            <label className="flex items-start gap-3 cursor-pointer ml-6">
              <input
                type="checkbox"
                checked={settings.cancelOnPublicHolidaysOnlyDuringSchoolHolidays}
                onChange={e => setSettings(p => ({ ...p, cancelOnPublicHolidaysOnlyDuringSchoolHolidays: e.target.checked }))}
                className="mt-0.5 rounded"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Seulement si également en vacances scolaires</p>
                <p className="text-xs text-gray-400">Ex : 1er mai pendant les vacances = pas de cours. 1er mai hors vacances = cours maintenu.</p>
              </div>
            </label>
          )}
        </div>

        <div className="flex gap-3 flex-wrap">
          <button type="submit" disabled={saving}
            className="bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
          <button type="button" onClick={handleRegenerate} disabled={regenerating}
            className="border border-gray-300 text-gray-700 font-semibold px-5 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm">
            {regenerating ? 'Recalcul en cours…' : 'Recalculer les séances'}
          </button>
        </div>
      </form>
    </div>
  );
}
