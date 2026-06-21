'use client';

import { useState, useEffect } from 'react';
import { collection, doc, getDocs, getDoc, updateDoc, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RoleConfig, RoleColor } from '@cdv/types';
import { ROLE_COLOR_CLASSES } from '@cdv/types';

interface Schema { id: string; name: string; isActive: boolean; }

function RoleBadge({ label, color }: { label: string; color: RoleColor }) {
  const cls = ROLE_COLOR_CLASSES[color];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls.bg} ${cls.text} ${cls.border}`}>
      {label}
    </span>
  );
}

export default function ProfileMappingPage() {
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const [rolesSnap, schemasSnap, settingsSnap] = await Promise.all([
        getDocs(query(collection(db, 'roles'), orderBy('displayOrder'))),
        getDocs(collection(db, 'profileSchemas')),
        getDoc(doc(db, 'appSettings', 'main')),
      ]);

      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() } as RoleConfig)));
      setSchemas(schemasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Schema)));

      const saved = settingsSnap.data()?.profileMapping ?? {};
      const initial: Record<string, string> = {};
      for (const d of rolesSnap.docs) {
        initial[d.id] = saved[d.id]?.schemaId ?? '';
      }
      setMapping(initial);
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const profileMapping: Record<string, { schemaId: string }> = {};
      for (const [roleKey, schemaId] of Object.entries(mapping)) {
        if (schemaId) profileMapping[roleKey] = { schemaId };
      }
      await updateDoc(doc(db, 'appSettings', 'main'), {
        profileMapping,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const defaultSchema = schemas.find(s => s.isActive);

  if (loading) return <p className="text-gray-400 p-8">Chargement…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mapping profils</h1>
      <p className="text-sm text-gray-500 mb-6">
        Associez un schéma de champs personnalisés à chaque rôle. Sans mapping, le schéma actif par défaut est utilisé.
      </p>

      {schemas.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 mb-6">
          Aucun schéma de champs personnalisés créé. Créez d'abord des schémas dans{' '}
          <a href="/admin/settings/custom-fields" className="underline font-medium">Champs custom</a>.
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {roles.map(role => (
            <div key={role.id} className="flex items-center gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl">
              <div className="w-32 flex-shrink-0">
                <RoleBadge label={role.label} color={role.color} />
              </div>
              <div className="flex-1">
                <select
                  value={mapping[role.key] ?? ''}
                  onChange={e => setMapping(prev => ({ ...prev, [role.key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white"
                >
                  <option value="">
                    {defaultSchema ? `Schéma par défaut (${defaultSchema.name})` : '— Aucun schéma —'}
                  </option>
                  {schemas.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.isActive ? ' ✓' : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || schemas.length === 0}
        className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
      </button>
    </div>
  );
}
