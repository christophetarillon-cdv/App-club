'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Room {
  id: string;
  name: string;
  capacity?: number;
}

const emptyForm = { name: '', capacity: '' };

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const q = query(collection(db, 'rooms'), orderBy('name'));
    const snap = await getDocs(q);
    setRooms(snap.docs.map(d => ({
      id: d.id,
      name: d.data().name,
      capacity: d.data().capacity,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, unknown> = { name: form.name, updatedAt: serverTimestamp() };
    if (form.capacity !== '') payload.capacity = Number(form.capacity);
    if (editId) {
      await updateDoc(doc(db, 'rooms', editId), payload);
    } else {
      await addDoc(collection(db, 'rooms'), { ...payload, createdAt: serverTimestamp() });
    }
    setForm(emptyForm); setEditId(null); setSaving(false);
    await load();
  };

  const startEdit = (r: Room) => {
    setForm({ name: r.name, capacity: r.capacity != null ? String(r.capacity) : '' });
    setEditId(r.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette salle ?')) return;
    await deleteDoc(doc(db, 'rooms', id));
    await load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Salles</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {editId ? 'Modifier la salle' : 'Nouvelle salle'}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
              placeholder="ex : Salle A"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Capacité (optionnel)</label>
            <input
              type="number"
              value={form.capacity}
              onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))}
              min={1}
              placeholder="ex : 20"
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
          {rooms.length === 0 && <p className="text-gray-400 text-sm">Aucune salle créée.</p>}
          {rooms.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between">
              <div>
                <span className="font-semibold text-gray-900">{r.name}</span>
                {r.capacity != null && (
                  <span className="ml-2 text-xs text-gray-400">{r.capacity} places</span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(r)} className="text-sm text-blue-600 hover:underline">Modifier</button>
                <button onClick={() => handleDelete(r.id)} className="text-sm text-red-500 hover:underline">Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
