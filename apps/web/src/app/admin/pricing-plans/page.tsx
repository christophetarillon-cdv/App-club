'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Season { id: string; label: string; }
interface PricingPlan {
  id: string;
  seasonId: string;
  label: string;
  amount: number; // cents
  conditions: string;
  isActive: boolean;
}

const emptyForm = { seasonId: '', label: '', amount: '', conditions: '', isActive: true };

export default function PricingPlansPage() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [plansSnap, seasonsSnap] = await Promise.all([
      getDocs(query(collection(db, 'pricingPlans'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'seasons'), orderBy('startDate', 'desc'))),
    ]);
    setPlans(plansSnap.docs.map(d => ({
      id: d.id,
      seasonId: d.data().seasonId,
      label: d.data().label,
      amount: d.data().amount,
      conditions: d.data().conditions ?? '',
      isActive: d.data().isActive ?? true,
    })));
    setSeasons(seasonsSnap.docs.map(d => ({ id: d.id, label: d.data().label })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      seasonId: form.seasonId,
      label: form.label,
      amount: Math.round(parseFloat(form.amount) * 100),
      conditions: form.conditions,
      isActive: form.isActive,
      updatedAt: serverTimestamp(),
    };
    if (editId) {
      await updateDoc(doc(db, 'pricingPlans', editId), payload);
    } else {
      await addDoc(collection(db, 'pricingPlans'), { ...payload, createdAt: serverTimestamp() });
    }
    setForm(emptyForm); setEditId(null); setSaving(false);
    await load();
  };

  const startEdit = (p: PricingPlan) => {
    setForm({
      seasonId: p.seasonId,
      label: p.label,
      amount: (p.amount / 100).toFixed(2),
      conditions: p.conditions,
      isActive: p.isActive,
    });
    setEditId(p.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce tarif ?')) return;
    await deleteDoc(doc(db, 'pricingPlans', id));
    await load();
  };

  const seasonLabel = (id: string) => seasons.find(s => s.id === id)?.label ?? id;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tarifs</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {editId ? 'Modifier le tarif' : 'Nouveau tarif'}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Saison</label>
            <select value={form.seasonId} onChange={e => setForm(p => ({ ...p, seasonId: e.target.value }))} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
              <option value="">Choisir…</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Montant (€)</label>
            <input type="number" step="0.01" min="0" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required placeholder="ex : 150.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Libellé</label>
          <input type="text" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} required
            placeholder="ex : Cotisation adulte"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Conditions</label>
          <textarea value={form.conditions} onChange={e => setForm(p => ({ ...p, conditions: e.target.value }))} rows={2}
            placeholder="ex : Pour les adultes de 18 ans et plus"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="rounded" />
          Tarif actif
        </label>
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
          {plans.length === 0 && <p className="text-gray-400 text-sm">Aucun tarif créé.</p>}
          {plans.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{p.label}</p>
                <p className="text-sm text-gray-700 mt-0.5">{(p.amount / 100).toFixed(2)} €</p>
                <p className="text-xs text-gray-400 mt-0.5">{seasonLabel(p.seasonId)}</p>
                {p.conditions && <p className="text-xs text-gray-500 mt-1">{p.conditions}</p>}
                {!p.isActive && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full mt-1 inline-block">Inactif</span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(p)} className="text-sm text-blue-600 hover:underline">Modifier</button>
                <button onClick={() => handleDelete(p.id)} className="text-sm text-red-500 hover:underline">Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
