'use client';

import { useState, useEffect } from 'react';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, limit, setDoc, writeBatch, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  sortableKeyboardCoordinates, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CustomField, CustomFieldType, CustomFieldRole, RoleConfig } from '@cdv/types';

// ── Utilitaires ───────────────────────────────────────────────────────────────

function toFieldKey(label: string): string {
  return label
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Texte court', long_text: 'Texte long', number: 'Nombre',
  date: 'Date', select: 'Liste déroulante', multiselect: 'Cases à cocher (plusieurs choix)',
  checkbox: 'Oui / Non (case unique)', file: 'Fichier',
};

// ── Draft (formulaire local) ──────────────────────────────────────────────────

interface FieldDraft {
  label: string;
  key: string;
  keyManual: boolean;
  type: CustomFieldType;
  required: boolean;
  options: string;
  visibility: CustomFieldRole[];
  editability: CustomFieldRole[];
  category: string;
  helpText: string;
}

const EMPTY_DRAFT: FieldDraft = {
  label: '', key: '', keyManual: false,
  type: 'text', required: false, options: '',
  visibility: ['member', 'instructor', 'bureau', 'admin'],
  editability: ['member', 'instructor', 'bureau', 'admin'],
  category: '', helpText: '',
};

function fieldToDraft(f: CustomField): FieldDraft {
  return {
    label: f.label, key: f.key, keyManual: true,
    type: f.type, required: f.required,
    options: f.options.join('\n'),
    visibility: f.visibility, editability: f.editability,
    category: f.category ?? '', helpText: f.helpText ?? '',
  };
}

function draftToData(d: FieldDraft, displayOrder: number) {
  return {
    label: d.label.trim(),
    key: d.key.trim() || toFieldKey(d.label),
    type: d.type,
    required: d.required,
    options: d.type === 'select' || d.type === 'multiselect'
      ? d.options.split('\n').map(s => s.trim()).filter(Boolean)
      : [],
    visibility: d.visibility,
    editability: d.editability,
    category: d.category.trim() || null,
    helpText: d.helpText.trim() || null,
    displayOrder,
  };
}

// ── Éditeur de champ ──────────────────────────────────────────────────────────

function RoleCheckboxes({
  label, value, onChange, roles,
}: { label: string; value: CustomFieldRole[]; onChange: (v: CustomFieldRole[]) => void; roles: RoleConfig[] }) {
  const toggle = (key: string) =>
    onChange(
      value.includes(key as CustomFieldRole)
        ? value.filter(r => r !== key)
        : [...value, key as CustomFieldRole]
    );
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex gap-3 flex-wrap">
        {roles.map(role => (
          <label key={role.key} className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={value.includes(role.key as CustomFieldRole)} onChange={() => toggle(role.key)}
              className="w-3.5 h-3.5 rounded" />
            <span className="text-xs text-gray-700">{role.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function FieldEditor({
  draft, onChange, onSave, onCancel, saving, isNew, roles,
}: {
  draft: FieldDraft;
  onChange: (d: FieldDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
  roles: RoleConfig[];
}) {
  const set = <K extends keyof FieldDraft>(k: K, v: FieldDraft[K]) =>
    onChange({ ...draft, [k]: v });

  const needsOptions = draft.type === 'select' || draft.type === 'multiselect';

  return (
    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mt-2 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Libellé *</label>
          <input value={draft.label}
            onChange={e => {
              const label = e.target.value;
              onChange({
                ...draft, label,
                key: draft.keyManual ? draft.key : toFieldKey(label),
              });
            }}
            placeholder="Ex : Taille (cm)"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Clé (snake_case)</label>
          <input value={draft.key}
            onChange={e => onChange({ ...draft, key: e.target.value, keyManual: true })}
            placeholder="taille_cm"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select value={draft.type}
            onChange={e => set('type', e.target.value as CustomFieldType)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            {(Object.entries(TYPE_LABELS) as [CustomFieldType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          {draft.type === 'checkbox' && (
            <p className="text-[10px] text-gray-400 mt-1">Réponse unique oui/non. Pour proposer des choix, utilisez « Cases à cocher ».</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Catégorie (optionnel)</label>
          <input value={draft.category} onChange={e => set('category', e.target.value)}
            placeholder="Ex : Médical"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
      </div>

      {needsOptions && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Options (une par ligne)</label>
          <textarea value={draft.options} onChange={e => set('options', e.target.value)}
            rows={4} placeholder={"Option 1\nOption 2\nOption 3"}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1">Texte d'aide (optionnel)</label>
        <input value={draft.helpText} onChange={e => set('helpText', e.target.value)}
          placeholder="Indication affichée sous le champ"
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
      </div>

      <RoleCheckboxes label="Visible par" value={draft.visibility}
        onChange={v => set('visibility', v)} roles={roles} />
      <RoleCheckboxes label="Modifiable par" value={draft.editability}
        onChange={v => set('editability', v)} roles={roles} />

      <div className="flex items-center gap-4 pt-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={draft.required} onChange={e => set('required', e.target.checked)}
            className="w-4 h-4 rounded" />
          <span className="text-sm text-gray-700">Champ obligatoire</span>
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={saving || !draft.label.trim()}
          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Enregistrement…' : isNew ? 'Créer le champ' : 'Enregistrer'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-1.5 border border-gray-300 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Ligne triable ─────────────────────────────────────────────────────────────

function SortableFieldRow({
  field, isEditing, draft, onStartEdit, onDraftChange, onSave, onCancel, onDelete, saving, roles,
}: {
  field: CustomField;
  isEditing: boolean;
  draft: FieldDraft;
  onStartEdit: () => void;
  onDraftChange: (d: FieldDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  saving: boolean;
  roles: RoleConfig[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 bg-white rounded-xl mb-2 hover:border-gray-300 transition-colors">
        {/* Drag handle */}
        <button
          {...attributes} {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          aria-label="Réordonner">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{field.label}</span>
            {field.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{field.category}</span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-mono">{field.key}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">{TYPE_LABELS[field.type]}</span>
            {field.required && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500">Obligatoire</span>
            )}
          </div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {field.visibility.map(r => {
              const role = roles.find(ro => ro.key === r);
              return (
                <span key={r} className="text-[9px] px-1 py-0.5 rounded bg-gray-50 text-gray-400 border border-gray-100">
                  {role?.label ?? r}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onStartEdit}
            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
            Modifier
          </button>
          <button onClick={() => setConfirmDelete(true)}
            className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
            Supprimer
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="mb-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
          <p className="text-xs text-red-700 flex-1">Supprimer « {field.label} » et toutes les données associées ?</p>
          <button onClick={() => { onDelete(); setConfirmDelete(false); }}
            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700">
            Confirmer
          </button>
          <button onClick={() => setConfirmDelete(false)}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">
            Annuler
          </button>
        </div>
      )}

      {isEditing && (
        <FieldEditor
          draft={draft} onChange={onDraftChange}
          onSave={onSave} onCancel={onCancel}
          saving={saving} isNew={false} roles={roles}
        />
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function CustomFieldsPage() {
  const [schemaId, setSchemaId] = useState<string | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FieldDraft>(EMPTY_DRAFT);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState<FieldDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Charge rôles + schéma actif + ses champs
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const rolesSnap = await getDocs(query(collection(db, 'roles'), orderBy('displayOrder')));
        setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() } as RoleConfig)));

        let sid: string;
        const q = query(collection(db, 'profileSchemas'), where('isActive', '==', true), limit(1));
        const snap = await getDocs(q);

        if (snap.empty) {
          const ref = doc(collection(db, 'profileSchemas'));
          await setDoc(ref, {
            name: 'Profil membre',
            isActive: true,
            createdBy: auth.currentUser?.uid ?? 'system',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          sid = ref.id;
        } else {
          sid = snap.docs[0].id;
        }

        setSchemaId(sid);
        const fieldsSnap = await getDocs(
          query(collection(db, 'profileSchemas', sid, 'fields'), orderBy('displayOrder'))
        );
        setFields(fieldsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CustomField)));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Drag-and-drop : réordonne et sauvegarde en batch
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !schemaId) return;

    setFields(prev => {
      const oldIndex = prev.findIndex(f => f.id === active.id);
      const newIndex = prev.findIndex(f => f.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex).map((f, i) => ({ ...f, displayOrder: i }));

      const batch = writeBatch(db);
      reordered.forEach(f => {
        batch.update(doc(db, 'profileSchemas', schemaId, 'fields', f.id), { displayOrder: f.displayOrder });
      });
      batch.commit();

      return reordered;
    });
  };

  // Ajouter un champ
  const handleAdd = async () => {
    if (!schemaId || !addDraft.label.trim()) return;
    setSaving(true);
    try {
      const displayOrder = fields.length;
      const data = draftToData(addDraft, displayOrder);
      const ref = await addDoc(collection(db, 'profileSchemas', schemaId, 'fields'), {
        ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setFields(prev => [...prev, { id: ref.id, ...data, options: data.options, category: data.category ?? undefined, helpText: data.helpText ?? undefined } as CustomField]);
      setAddDraft(EMPTY_DRAFT);
      setShowAddForm(false);
    } finally {
      setSaving(false);
    }
  };

  // Modifier un champ
  const handleEdit = async (fieldId: string) => {
    if (!schemaId) return;
    setSaving(true);
    try {
      const field = fields.find(f => f.id === fieldId)!;
      const data = draftToData(editDraft, field.displayOrder);
      await updateDoc(doc(db, 'profileSchemas', schemaId, 'fields', fieldId), {
        ...data, updatedAt: serverTimestamp(),
      });
      setFields(prev => prev.map(f => f.id === fieldId
        ? { ...f, ...data, options: data.options, category: data.category ?? undefined, helpText: data.helpText ?? undefined }
        : f
      ));
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  // Supprimer un champ
  const handleDelete = async (fieldId: string) => {
    if (!schemaId) return;
    await deleteDoc(doc(db, 'profileSchemas', schemaId, 'fields', fieldId));
    setFields(prev => {
      const updated = prev.filter(f => f.id !== fieldId).map((f, i) => ({ ...f, displayOrder: i }));
      const batch = writeBatch(db);
      updated.forEach(f => batch.update(doc(db, 'profileSchemas', schemaId, 'fields', f.id), { displayOrder: f.displayOrder }));
      batch.commit();
      return updated;
    });
    if (editingId === fieldId) setEditingId(null);
  };

  if (loading) return <p className="text-gray-400 p-8">Chargement…</p>;

  const fieldsByCategory = fields.reduce<Record<string, CustomField[]>>((acc, f) => {
    const cat = f.category ?? '';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Champs personnalisés</h1>
      <p className="text-sm text-gray-500 mb-6">
        Ajoutez des champs libres au profil des membres. Ils s'affichent dans le profil selon les rôles configurés.
      </p>

      {fields.length === 0 && !showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 border-dashed p-10 text-center mb-4">
          <p className="text-sm text-gray-400 mb-3">Aucun champ personnalisé pour l'instant.</p>
          <button onClick={() => { setShowAddForm(true); setAddDraft(EMPTY_DRAFT); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Créer le premier champ
          </button>
        </div>
      )}

      {fields.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
            <div className="mb-4">
              {fields.map(field => (
                <SortableFieldRow
                  key={field.id}
                  field={field}
                  isEditing={editingId === field.id}
                  draft={editDraft}
                  onStartEdit={() => { setEditingId(field.id); setEditDraft(fieldToDraft(field)); setShowAddForm(false); }}
                  onDraftChange={setEditDraft}
                  onSave={() => handleEdit(field.id)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => handleDelete(field.id)}
                  saving={saving}
                  roles={roles}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showAddForm ? (
        <FieldEditor
          draft={addDraft} onChange={setAddDraft}
          onSave={handleAdd} onCancel={() => setShowAddForm(false)}
          saving={saving} isNew roles={roles}
        />
      ) : (
        fields.length > 0 && (
          <button
            onClick={() => { setShowAddForm(true); setAddDraft(EMPTY_DRAFT); setEditingId(null); }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Ajouter un champ
          </button>
        )
      )}

      {fields.length > 1 && (
        <p className="text-xs text-gray-400 mt-4">
          Glissez-déposez les champs pour modifier leur ordre d'affichage.
        </p>
      )}
    </div>
  );
}
