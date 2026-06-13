'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Season {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  registrationOpen: boolean;
}

const emptyForm = { label: '', startDate: '', endDate: '', isActive: false, registrationOpen: false };

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const q = query(collection(db, 'seasons'), orderBy('startDate', 'desc'));
    const snap = await getDocs(q);
    setSeasons(snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        label: data.label,
        startDate: data.startDate?.toDate?.()?.toISOString().slice(0, 10) ?? '',
        endDate: data.endDate?.toDate?.()?.toISOString().slice(0, 10) ?? '',
        isActive: data.isActive ?? false,
        registrationOpen: data.registrationOpen ?? false,
      };
    }));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      label: form.label,
      startDate: new Date(form.startDate),
      endDate: new Date(form.endDate),
      isActive: form.isActive,
      registrationOpen: form.registrationOpen,
      updatedAt: serverTimestamp(),
    };
    if (editId) {
      await updateDoc(doc(db, 'seasons', editId), payload);
    } else {
      await addDoc(collection(db, 'seasons'), { ...payload, createdAt: serverTimestamp() });
    }
    setForm(emptyForm); setEditId(null); setSaving(false);
    await load();
  };

  const startEdit = (s: Season) => {
    setForm({ label: s.label, startDate: s.startDate, endDate: s.endDate, isActive: s.isActive, registrationOpen: s.registrationOpen });
    setEditId(s.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette saison ?')) return;
    await deleteDoc(doc(db, 'seasons', id));
    await load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Saisons</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{editId ? 'Modifier la saison' : 'Nouvelle saison'}</h2>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Libellé</label>
          <input type="text" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} required placeholder="ex : 2024-2025"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Début</label>
            <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fin</label>
            <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="rounded" />
            Saison active
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.registrationOpen} onChange={e => setForm(p => ({ ...p, registrationOpen: e.target.checked }))} className="rounded" />
            Inscriptions ouvertes
          </label>
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
          {seasons.length === 0 && <p className="text-gray-400 text-sm">Aucune saison créée.</p>}
          {seasons.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.startDate} → {s.endDate}</p>
                <div className="flex gap-2 mt-1.5">
                  {s.isActive && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>}
                  {s.registrationOpen && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Inscriptions ouvertes</span>}
                </div>
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
