'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface BankAccount {
  id: string;
  name: string;
  bank: string;
  accountNumber: string;
  holder: string;
  label: string;
}

const emptyForm = { name: '', bank: '', accountNumber: '', holder: '', label: '' };


export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const snap = await getDocs(query(collection(db, 'bankAccounts'), orderBy('name')));
    setAccounts(snap.docs.map(d => ({
      id: d.id,
      name: d.data().name ?? '',
      bank: d.data().bank ?? '',
      accountNumber: d.data().accountNumber ?? '',
      holder: d.data().holder ?? '',
      label: d.data().label ?? '',
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      bank: form.bank,
      accountNumber: form.accountNumber.trim(),
      holder: form.holder,
      label: form.label,
      updatedAt: serverTimestamp(),
    };
    if (editId) {
      await updateDoc(doc(db, 'bankAccounts', editId), payload);
    } else {
      await addDoc(collection(db, 'bankAccounts'), { ...payload, createdAt: serverTimestamp() });
    }
    setForm(emptyForm);
    setEditId(null);
    setSaving(false);
    await load();
  };

  const startEdit = (a: BankAccount) => {
    setForm({ name: a.name, bank: a.bank, accountNumber: a.accountNumber, holder: a.holder, label: a.label });
    setEditId(a.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce compte bancaire ?')) return;
    await deleteDoc(doc(db, 'bankAccounts', id));
    await load();
  };

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50';
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Comptes bancaires</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {editId ? 'Modifier le compte' : 'Nouveau compte'}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nom du compte</label>
            <input type="text" value={form.name} required placeholder="ex : Compte principal"
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Banque</label>
            <input type="text" value={form.bank} required placeholder="ex : Crédit Agricole"
              onChange={e => setForm(p => ({ ...p, bank: e.target.value }))}
              className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Titulaire</label>
          <input type="text" value={form.holder} required placeholder="ex : Club de Danse de Voiron"
            onChange={e => setForm(p => ({ ...p, holder: e.target.value }))}
            className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Numéro de compte</label>
          <input type="text" value={form.accountNumber} required placeholder="ex : 00012345678"
            onChange={e => setForm(p => ({ ...p, accountNumber: e.target.value }))}
            className={`${inputCls} font-mono`} />
        </div>

        <div>
          <label className={labelCls}>Libellé libre</label>
          <input type="text" value={form.label} placeholder="ex : Compte courant dédié cotisations"
            onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
            className={inputCls} />
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
          {accounts.length === 0 && (
            <p className="text-gray-400 text-sm">Aucun compte bancaire configuré.</p>
          )}
          {accounts.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="font-semibold text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-500">{a.holder} — {a.bank}</p>
                  <p className="text-xs font-mono text-gray-600">{a.accountNumber}</p>
                  {a.label && <p className="text-xs text-gray-400 italic">{a.label}</p>}
                </div>
                <div className="flex gap-3 flex-shrink-0">
                  <button onClick={() => startEdit(a)} className="text-sm text-blue-600 hover:underline">Modifier</button>
                  <button onClick={() => handleDelete(a.id)} className="text-sm text-red-500 hover:underline">Supprimer</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
