'use client';

import { useState, useEffect } from 'react';
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RoleConfig, RoleColor } from '@cdv/types';
import { SYSTEM_ROLES, ROLE_COLOR_CLASSES } from '@cdv/types';

const COLORS: RoleColor[] = ['blue', 'green', 'orange', 'purple', 'red', 'gray', 'pink', 'teal'];
const COLOR_LABELS: Record<RoleColor, string> = {
  blue: 'Bleu', green: 'Vert', orange: 'Orange', purple: 'Violet',
  red: 'Rouge', gray: 'Gris', pink: 'Rose', teal: 'Turquoise',
};

async function ensureSystemRoles() {
  const snap = await getDocs(collection(db, 'roles'));
  if (!snap.empty) return;
  for (const role of SYSTEM_ROLES) {
    const ref = doc(db, 'roles', role.key);
    await setDoc(ref, { ...role, id: role.key, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
}

function RoleBadge({ role }: { role: RoleConfig }) {
  const cls = ROLE_COLOR_CLASSES[role.color];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls.bg} ${cls.text} ${cls.border}`}>
      {role.label}
    </span>
  );
}

interface RoleEditorProps {
  role: RoleConfig;
  onSave: (label: string, color: RoleColor) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

function RoleEditor({ role, onSave, onDelete, onCancel }: RoleEditorProps) {
  const [label, setLabel] = useState(role.label);
  const [color, setColor] = useState<RoleColor>(role.color);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try { await onSave(label.trim(), color); } finally { setSaving(false); }
  };

  return (
    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mt-2 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Libellé *</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Couleur</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {COLORS.map(c => {
              const cls = ROLE_COLOR_CLASSES[c];
              return (
                <button key={c} type="button" onClick={() => setColor(c)}
                  title={COLOR_LABELS[c]}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${cls.bg} ${
                    color === c ? 'border-gray-800 scale-110' : 'border-transparent hover:border-gray-400'
                  }`} />
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Aperçu :</span>
        <RoleBadge role={{ ...role, label: label || role.label, color }} />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving || !label.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={onCancel}
            className="px-4 py-1.5 border border-gray-300 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
            Annuler
          </button>
        </div>
        {onDelete && !role.isSystem && (
          confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600">Confirmer la suppression ?</span>
              <button onClick={onDelete} className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700">
                Oui, supprimer
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
                Annuler
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
              Supprimer
            </button>
          )
        )}
      </div>
    </div>
  );
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<RoleColor>('gray');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      await ensureSystemRoles();
      const snap = await getDocs(query(collection(db, 'roles'), orderBy('displayOrder')));
      setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() } as RoleConfig)));
      setLoading(false);
    })();
  }, []);

  const handleUpdate = async (roleId: string, label: string, color: RoleColor) => {
    await updateDoc(doc(db, 'roles', roleId), { label, color, updatedAt: serverTimestamp() });
    setRoles(prev => prev.map(r => r.id === roleId ? { ...r, label, color } : r));
    setEditingId(null);
  };

  const handleDelete = async (roleId: string) => {
    await deleteDoc(doc(db, 'roles', roleId));
    setRoles(prev => prev.filter(r => r.id !== roleId));
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setSaving(true);
    try {
      const key = newLabel.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const newRole: Omit<RoleConfig, 'id'> = {
        key,
        label: newLabel.trim(),
        color: newColor,
        isSystem: false,
        displayOrder: roles.length,
      };
      const ref = doc(db, 'roles', key);
      await setDoc(ref, { ...newRole, id: key, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setRoles(prev => [...prev, { ...newRole, id: key }]);
      setNewLabel('');
      setNewColor('gray');
      setShowAddForm(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-400 p-8">Chargement…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Rôles</h1>
      <p className="text-sm text-gray-500 mb-6">
        Personnalisez les libellés et couleurs des rôles. Les rôles système ne peuvent pas être supprimés.
      </p>

      <div className="space-y-2 mb-4">
        {roles.map(role => (
          <div key={role.id}>
            <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 bg-white rounded-xl hover:border-gray-300 transition-colors">
              <div className="flex-1 flex items-center gap-3">
                <RoleBadge role={role} />
                <span className="text-xs font-mono text-gray-400">{role.key}</span>
                {role.isSystem && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">Système</span>
                )}
              </div>
              <button onClick={() => setEditingId(editingId === role.id ? null : role.id)}
                className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
                Modifier
              </button>
            </div>

            {editingId === role.id && (
              <RoleEditor
                role={role}
                onSave={(label, color) => handleUpdate(role.id, label, color)}
                onDelete={!role.isSystem ? () => handleDelete(role.id) : undefined}
                onCancel={() => setEditingId(null)}
              />
            )}
          </div>
        ))}
      </div>

      {showAddForm ? (
        <div className="border border-gray-200 bg-white rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Nouveau rôle</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Libellé *</label>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="Ex : Bénévole"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Couleur</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {COLORS.map(c => {
                  const cls = ROLE_COLOR_CLASSES[c];
                  return (
                    <button key={c} type="button" onClick={() => setNewColor(c)}
                      title={COLOR_LABELS[c]}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${cls.bg} ${
                        newColor === c ? 'border-gray-800 scale-110' : 'border-transparent hover:border-gray-400'
                      }`} />
                  );
                })}
              </div>
            </div>
          </div>
          {newLabel && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Aperçu :</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLOR_CLASSES[newColor].bg} ${ROLE_COLOR_CLASSES[newColor].text} ${ROLE_COLOR_CLASSES[newColor].border}`}>
                {newLabel}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !newLabel.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Création…' : 'Créer le rôle'}
            </button>
            <button onClick={() => { setShowAddForm(false); setNewLabel(''); setNewColor('gray'); }}
              className="px-4 py-1.5 border border-gray-300 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Ajouter un rôle
        </button>
      )}
    </div>
  );
}
