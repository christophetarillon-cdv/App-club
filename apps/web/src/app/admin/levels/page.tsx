'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Level {
  id: string;
  name: string;
  order: number;
}

const emptyForm = { name: '', order: 1 };

export default function LevelsPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const q = query(collection(db, 'levels'), orderBy('order'));
    const snap = await getDocs(q);
    setLevels(snap.docs.map(d => ({ id: d.id, name: d.data().name, order: d.data().order ?? 0 })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { name: form.name, order: Number(form.order), updatedAt: serverTimestamp() };
    if (editId) {
      await updateDoc(doc(db, 'levels', editId), payload);
    } else {
      await addDoc(collection(db, 'levels'), { ...payload, createdAt: serverTimestamp() });
    }
    setForm(emptyForm); setEditId(null); setSaving(false);
    await load();
  };

  const startEdit = (l: Level) => {
    setForm({ name: l.name, order: l.order });
    setEditId(l.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce niveau ?')) return;
    await deleteDoc(doc(db, 'levels', id));
    await load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Niveaux</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {editId ? 'Modifier le niveau' : 'Nouveau niveau'}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
              placeholder="ex : Débutant"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ordre d'affichage</label>
            <input
              type="number"
              value={form.order}
              onChange={e => setForm(p => ({ ...p, order: Number(e.target.value) }))}
              required
              min={0}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
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
          {levels.length === 0 && <p className="text-gray-400 text-sm">Aucun niveau créé.</p>}
          {levels.map(l => (
            <div key={l.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between">
              <div>
                <span className="font-semibold text-gray-900">{l.name}</span>
                <span className="ml-2 text-xs text-gray-400">ordre {l.order}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(l)} className="text-sm text-blue-600 hover:underline">Modifier</button>
                <button onClick={() => handleDelete(l.id)} className="text-sm text-red-500 hover:underline">Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
