'use client';

import { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RoleConfig } from '@cdv/types';

function RoleCheckboxGroup({
  roles, selected, onChange,
}: { roles: RoleConfig[]; selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {roles.map(r => (
        <label key={r.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.includes(r.key)}
            onChange={e => onChange(e.target.checked ? [...selected, r.key] : selected.filter(k => k !== r.key))}
          />
          {r.label}
        </label>
      ))}
    </div>
  );
}

export default function CalendarSyncSettingsPage() {
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'roles'), orderBy('displayOrder'))),
      getDoc(doc(db, 'appSettings', 'main')),
    ]).then(([rolesSnap, settingsSnap]) => {
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() } as RoleConfig)).filter(r => r.key !== 'admin'));
      setSelected(settingsSnap.data()?.calendarSyncRoles ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    await setDoc(doc(db, 'appSettings', 'main'), { calendarSyncRoles: selected }, { merge: true });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Synchronisation agenda</h1>
      <p className="text-sm text-gray-500 mb-6">
        Rôles autorisés à s'abonner au flux iCal du planning du club depuis leur agenda personnel
        (admin toujours autorisé, sans besoin d'être coché).
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4 max-w-2xl">
          <RoleCheckboxGroup roles={roles} selected={selected} onChange={setSelected} />

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
