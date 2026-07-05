'use client';

import { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RoleConfig } from '@cdv/types';

interface RoleFlags {
  sessionVideoUploadRoles: string[];
  sessionVideoViewRoles: string[];
  sessionNoteEditRoles: string[];
}

const EMPTY: RoleFlags = { sessionVideoUploadRoles: [], sessionVideoViewRoles: [], sessionNoteEditRoles: [] };

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

export default function SessionDetailSettingsPage() {
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [flags, setFlags] = useState<RoleFlags>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'roles'), orderBy('displayOrder'))),
      getDoc(doc(db, 'appSettings', 'main')),
    ]).then(([rolesSnap, settingsSnap]) => {
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() } as RoleConfig)).filter(r => r.key !== 'admin'));
      const data = settingsSnap.data() ?? {};
      setFlags({
        sessionVideoUploadRoles: data.sessionVideoUploadRoles ?? [],
        sessionVideoViewRoles: data.sessionVideoViewRoles ?? [],
        sessionNoteEditRoles: data.sessionNoteEditRoles ?? [],
      });
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    await setDoc(doc(db, 'appSettings', 'main'), flags, { merge: true });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Fiche détail de séance</h1>
      <p className="text-sm text-gray-500 mb-6">
        Rôles autorisés à interagir avec la vidéo et la note de programme sur la fiche détail d'une séance
        (admin toujours autorisé, sans besoin d'être coché).
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-6 max-w-2xl">
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Ajouter une vidéo</p>
            <p className="text-xs text-gray-400 mb-2">Rôles pouvant téléverser une vidéo depuis la fiche détail d'une séance.</p>
            <RoleCheckboxGroup roles={roles} selected={flags.sessionVideoUploadRoles}
              onChange={next => setFlags(f => ({ ...f, sessionVideoUploadRoles: next }))} />
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Voir la vidéo</p>
            <p className="text-xs text-gray-400 mb-2">Rôles pouvant visionner la vidéo une fois ajoutée.</p>
            <RoleCheckboxGroup roles={roles} selected={flags.sessionVideoViewRoles}
              onChange={next => setFlags(f => ({ ...f, sessionVideoViewRoles: next }))} />
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Modifier la note de programme</p>
            <p className="text-xs text-gray-400 mb-2">Rôles pouvant écrire/modifier le texte de programme du jour de la séance.</p>
            <RoleCheckboxGroup roles={roles} selected={flags.sessionNoteEditRoles}
              onChange={next => setFlags(f => ({ ...f, sessionNoteEditRoles: next }))} />
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
