'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, getDocs, collection, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RoleConfig } from '@cdv/types';
import { ADMIN_NAV, MEMBER_NAV } from '@/lib/admin-nav';

export default function PagePermissionsPage() {
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [rolesSnap, settingsSnap] = await Promise.all([
        getDocs(query(collection(db, 'roles'), orderBy('displayOrder'))),
        getDoc(doc(db, 'appSettings', 'main')),
      ]);

      const loadedRoles = rolesSnap.docs.map(d => ({ id: d.id, ...d.data() } as RoleConfig));
      setRoles(loadedRoles);

      const saved = (settingsSnap.data()?.pagePermissions ?? {}) as Record<string, string[]>;

      // Initialise toutes les pages avec leur permission sauvegardée (ou admin seulement par défaut)
      const allRoleKeys = loadedRoles.map(r => r.key);
      const initial: Record<string, string[]> = {};
      for (const group of ADMIN_NAV) {
        for (const item of group.items) {
          initial[item.href] = saved[item.href] ?? ['admin'];
        }
      }
      for (const group of MEMBER_NAV) {
        for (const item of group.items) {
          initial[item.href] = saved[item.href] ?? allRoleKeys;
        }
      }
      setPermissions(initial);
      setLoading(false);
    })();
  }, []);

  const toggleRole = (href: string, roleKey: string) => {
    if (roleKey === 'admin') return; // admin toujours autorisé
    setPermissions(prev => {
      const current = prev[href] ?? ['admin'];
      const updated = current.includes(roleKey)
        ? current.filter(r => r !== roleKey)
        : [...current, roleKey];
      // Admin toujours présent
      if (!updated.includes('admin')) updated.push('admin');
      return { ...prev, [href]: updated };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await setDoc(doc(db, 'appSettings', 'main'), {
        pagePermissions: permissions,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  // Tous les rôles Firestore
  const adminRoles = roles;

  if (loading) return <p className="text-gray-400 p-8">Chargement…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Accès aux pages</h1>
      <p className="text-sm text-gray-500 mb-6">
        Définissez quels rôles peuvent accéder à chaque page. Le rôle Admin a toujours accès à tout.
      </p>

      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Pages membres</h2>
      <div className="space-y-6 mb-8">
        {MEMBER_NAV.map(group => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
              <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-100">
                <div className="flex-1 text-xs text-gray-400">Page</div>
                {adminRoles.map(role => (
                  <div key={role.key} className="w-20 text-center text-xs text-gray-500 font-medium truncate">{role.label}</div>
                ))}
              </div>
              {group.items.map((item, i) => {
                const pageRoles = permissions[item.href] ?? adminRoles.map(r => r.key);
                return (
                  <div key={item.href} className={`flex items-center gap-4 px-4 py-3 ${i < group.items.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <div className="flex-1">
                      <span className="text-sm text-gray-800">{item.label}</span>
                      <span className="ml-2 text-[10px] font-mono text-gray-300">{item.href}</span>
                    </div>
                    {adminRoles.map(role => (
                      <div key={role.key} className="w-20 flex justify-center">
                        <input type="checkbox"
                          checked={pageRoles.includes(role.key)}
                          disabled={role.key === 'admin'}
                          onChange={() => toggleRole(item.href, role.key)}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
                      </div>
                    ))}
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Pages administration</h2>
      <div className="space-y-6 mb-8">
        {ADMIN_NAV.map(group => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
              {/* En-tête colonnes */}
              <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-100">
                <div className="flex-1 text-xs text-gray-400">Page</div>
                {adminRoles.map(role => (
                  <div key={role.key} className="w-20 text-center text-xs text-gray-500 font-medium truncate">
                    {role.label}
                  </div>
                ))}
              </div>

              {/* Lignes pages */}
              {group.items.map((item, i) => {
                const pageRoles = permissions[item.href] ?? ['admin'];
                return (
                  <div
                    key={item.href}
                    className={`flex items-center gap-4 px-4 py-3 ${i < group.items.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <div className="flex-1">
                      <span className="text-sm text-gray-800">{item.label}</span>
                      <span className="ml-2 text-[10px] font-mono text-gray-300">{item.href}</span>
                    </div>
                    {adminRoles.map(role => (
                      <div key={role.key} className="w-20 flex justify-center">
                        <input
                          type="checkbox"
                          checked={pageRoles.includes(role.key)}
                          disabled={role.key === 'admin'}
                          onChange={() => toggleRole(item.href, role.key)}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
      </button>
      {saveError && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          Erreur : {saveError}
        </p>
      )}
    </div>
  );
}
