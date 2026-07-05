'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ProfileFieldKey, ProfileFieldConfig, ProfileFieldsConfig } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS } from '@cdv/types';

interface FieldMeta {
  label: string;
  collection: 'dancer' | 'account' | 'locked';
  firestoreKey?: string;
}

const FIELD_META: Record<ProfileFieldKey, FieldMeta> = {
  firstName:          { label: 'Prénom',                  collection: 'locked' },
  lastName:           { label: 'Nom',                     collection: 'locked' },
  email:              { label: 'Email',                    collection: 'locked' },
  birthDate:          { label: 'Date de naissance',        collection: 'dancer' },
  gender:             { label: 'Genre',                    collection: 'dancer' },
  phone:              { label: 'Téléphone',                collection: 'account' },
  street:             { label: 'Adresse — Rue',            collection: 'dancer' },
  postalCode:         { label: 'Adresse — Code postal',     collection: 'dancer' },
  city:               { label: 'Adresse — Ville',          collection: 'dancer' },
  emergencyContact:   { label: "Contact d'urgence",        collection: 'dancer' },
  photo:              { label: 'Photo de profil',          collection: 'dancer', firestoreKey: 'photoUrl' },
  profession:         { label: 'Profession',               collection: 'dancer' },
  medicalNotes:       { label: 'Notes médicales',          collection: 'dancer' },
  healthCertificate:  { label: 'Certificat médical',       collection: 'dancer' },
  marketingConsent:   { label: 'Consentement marketing',   collection: 'account' },
  imageRightsConsent: { label: "Droits à l'image",         collection: 'account' },
};

const FIELD_ORDER: ProfileFieldKey[] = [
  'firstName', 'lastName', 'email', 'phone',
  'birthDate', 'gender', 'street', 'postalCode', 'city', 'emergencyContact', 'photo',
  'profession', 'medicalNotes', 'healthCertificate',
  'marketingConsent', 'imageRightsConsent',
];

function mergeWithDefaults(saved: Partial<ProfileFieldsConfig> | undefined): ProfileFieldsConfig {
  const result = { ...DEFAULT_PROFILE_FIELDS };
  if (saved) {
    for (const key of Object.keys(DEFAULT_PROFILE_FIELDS) as ProfileFieldKey[]) {
      if (saved[key]) result[key] = { ...DEFAULT_PROFILE_FIELDS[key], ...saved[key] };
    }
  }
  return result;
}

async function countFieldUsage(key: ProfileFieldKey): Promise<number> {
  const meta = FIELD_META[key];
  const firestoreKey = meta.firestoreKey ?? key;

  if (meta.collection === 'dancer' || meta.collection === 'locked') {
    const snap = await getDocs(collection(db, 'dancers'));
    return snap.docs.filter(d => {
      const v = d.data()[firestoreKey];
      return v !== undefined && v !== null && v !== '' && v !== false;
    }).length;
  } else {
    const snap = await getDocs(collection(db, 'accounts'));
    return snap.docs.filter(d => {
      const v = d.data()[firestoreKey];
      return v !== undefined && v !== null && v !== '' && v !== false;
    }).length;
  }
}

export default function ProfileFieldsPage() {
  const [config, setConfig] = useState<ProfileFieldsConfig>({ ...DEFAULT_PROFILE_FIELDS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingDisable, setPendingDisable] = useState<{ key: ProfileFieldKey; count: number } | null>(null);
  const [counting, setCounting] = useState<ProfileFieldKey | null>(null);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      setConfig(mergeWithDefaults(snap.data()?.profileFields));
    }).finally(() => setLoading(false));
  }, []);

  const handleToggleEnabled = async (key: ProfileFieldKey) => {
    const field = config[key];
    if (field.lockedByDefault) return;

    if (field.enabled) {
      // Désactivation — compter avant
      setCounting(key);
      const count = await countFieldUsage(key);
      setCounting(null);
      if (count > 0) {
        setPendingDisable({ key, count });
        return;
      }
    }
    applyToggleEnabled(key);
  };

  const applyToggleEnabled = (key: ProfileFieldKey) => {
    setConfig(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        enabled: !prev[key].enabled,
        required: !prev[key].enabled ? prev[key].required : false,
      },
    }));
    setSaved(false);
    setPendingDisable(null);
  };

  const handleToggleRequired = (key: ProfileFieldKey) => {
    const field = config[key];
    if (field.lockedByDefault || !field.enabled) return;
    setConfig(prev => ({
      ...prev,
      [key]: { ...prev[key], required: !prev[key].required },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(doc(db, 'appSettings', 'main'), {
        profileFields: config,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-400 p-8">Chargement…</p>;

  const collectionBadge = (col: FieldMeta['collection']) => {
    if (col === 'locked') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">Verrouillé</span>;
    if (col === 'dancer') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">Danseur</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-500">Compte</span>;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Champs du profil membre</h1>
      <p className="text-sm text-gray-500 mb-6">Configurez les champs affichés dans le profil et à l'inscription.</p>

      {pendingDisable && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-medium text-amber-800 mb-1">
            {pendingDisable.count} adhérent{pendingDisable.count > 1 ? 's ont' : ' a'} rempli ce champ.
          </p>
          <p className="text-xs text-amber-600 mb-3">
            Les données existantes ne seront pas supprimées, mais le champ ne sera plus affiché.
          </p>
          <div className="flex gap-2">
            <button onClick={() => applyToggleEnabled(pendingDisable.key)}
              className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700">
              Désactiver quand même
            </button>
            <button onClick={() => setPendingDisable(null)}
              className="px-3 py-1.5 border border-amber-300 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-100">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Champ</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Stockage</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Affiché</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Obligatoire</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {FIELD_ORDER.map(key => {
              const field: ProfileFieldConfig = config[key];
              const meta = FIELD_META[key];
              const locked = !!field.lockedByDefault;
              const isCounting = counting === key;

              return (
                <tr key={key} className={locked ? 'bg-gray-50/50' : ''}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`font-medium ${locked ? 'text-gray-400' : 'text-gray-800'}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{collectionBadge(meta.collection)}</td>
                  <td className="px-4 py-3 text-center">
                    {locked ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <button
                        onClick={() => handleToggleEnabled(key)}
                        disabled={isCounting}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          field.enabled ? 'bg-blue-600' : 'bg-gray-200'
                        } ${isCounting ? 'opacity-50' : ''}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          field.enabled ? 'translate-x-4' : 'translate-x-1'
                        }`} />
                      </button>
                    )}
                    {isCounting && <span className="ml-2 text-xs text-gray-400">…</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {locked || !field.enabled ? (
                      <span className="text-xs text-gray-300">{locked ? '✓' : '—'}</span>
                    ) : (
                      <button
                        onClick={() => handleToggleRequired(key)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          field.required ? 'bg-orange-500' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          field.required ? 'translate-x-4' : 'translate-x-1'
                        }`} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {saved && <p className="text-green-600 text-sm mb-3">Configuration sauvegardée.</p>}
      <button onClick={handleSave} disabled={saving}
        className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
        {saving ? 'Sauvegarde…' : 'Enregistrer la configuration'}
      </button>
    </div>
  );
}
