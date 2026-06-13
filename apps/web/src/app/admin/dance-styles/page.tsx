'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface DanceStyle {
  id: string;
  name: string;
  color: string;
}

const emptyForm = { name: '', color: '#3B82F6' };

export default function DanceStylesPage() {
  const [styles, setStyles] = useState<DanceStyle[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const q = query(collection(db, 'danceStyles'), orderBy('name'));
    const snap = await getDocs(q);
    setStyles(snap.docs.map(d => ({ id: d.id, name: d.data().name, color: d.data().color ?? '#3B82F6' })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { name: form.name, color: form.color, updatedAt: serverTimestamp() };
    if (editId) {
      await updateDoc(doc(db, 'danceStyles', editId), payload);
    } else {
      await addDoc(collection(db, 'danceStyles'), { ...payload, createdAt: serverTimestamp() });
    }
    setForm(emptyForm); setEditId(null); setSaving(false);
    await load();
  };

  const startEdit = (s: DanceStyle) => {
    setForm({ name: s.name, color: s.color });
    setEditId(s.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce style ?')) return;
    await deleteDoc(doc(db, 'danceStyles', id));
    await load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Styles de danse</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {editId ? 'Modifier le style' : 'Nouveau style'}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
              placeholder="ex : Salsa"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Couleur</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.color}
                onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                className="h-9 w-16 rounded border border-gray-300 cursor-pointer"
              />
              <span className="text-sm text-gray-500">{form.color}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
            {saving ? 'Sauvegarde…' : editId ? 'Mettre à jour' : 'Créer'}
          </button>
          {editId && (
            <button type="button" onClick={() => { setForm(emptyForm); setEditId(null); }}
              className="border border-gray-300 text-gray-600 font-semibold px-5 py-2 rounded-lg hover:bg-gray-50 text-sm">
              Annuler
            </button>
          )}
        </div>
      </form>

      {loading ? <p className="text-gray-500 text-sm">Chargement…</p> : (
        <div className="space-y-3">
          {styles.length === 0 && <p className="text-gray-400 text-sm">Aucun style créé.</p>}
          {styles.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="font-semibold text-gray-900">{s.name}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(s)} className="text-sm text-blue-600 hover:underline">Modifier</button>
                <button onClick={() => handleDelete(s.id)} className="text-sm text-red-500 hover:underline">Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
