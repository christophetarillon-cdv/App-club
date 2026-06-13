'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, orderBy, query, getDoc, setDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Interruption {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  type: 'school_holiday' | 'manual';
  zone?: 'A' | 'B' | 'C';
}

type InterruptionType = 'school_holiday' | 'manual';
type ZoneType = 'A' | 'B' | 'C';
type InterruptionForm = { label: string; startDate: string; endDate: string; type: InterruptionType; zone: ZoneType };

const emptyForm: InterruptionForm = { label: '', startDate: '', endDate: '', type: 'manual', zone: 'A' };

interface SchoolHolidayRecord {
  description: string;
  start_date: string;
  end_date: string;
  zones: string;
  annee_scolaire: string;
}

export default function InterruptionsPage() {
  const [interruptions, setInterruptions] = useState<Interruption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [schoolZone, setSchoolZone] = useState<'A' | 'B' | 'C'>('A');

  const load = async () => {
    const q = query(collection(db, 'interruptions'), orderBy('startDate'));
    const snap = await getDocs(q);
    setInterruptions(snap.docs.map(d => ({
      id: d.id,
      label: d.data().label,
      startDate: d.data().startDate,
      endDate: d.data().endDate,
      type: d.data().type,
      zone: d.data().zone,
    })));
    setLoading(false);
  };

  const loadSettings = async () => {
    const snap = await getDoc(doc(db, 'appSettings', 'main'));
    if (snap.exists()) setSchoolZone(snap.data().schoolZone ?? 'A');
  };

  useEffect(() => { Promise.all([load(), loadSettings()]); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, unknown> = {
      label: form.label,
      startDate: form.startDate,
      endDate: form.endDate,
      type: form.type,
      updatedAt: serverTimestamp(),
    };
    if (form.type === 'school_holiday') payload.zone = form.zone;

    if (editId) {
      await updateDoc(doc(db, 'interruptions', editId), payload);
    } else {
      await addDoc(collection(db, 'interruptions'), { ...payload, createdAt: serverTimestamp() });
    }
    setForm(emptyForm); setEditId(null); setSaving(false);
    await load();
  };

  const startEdit = (i: Interruption) => {
    setForm({ label: i.label, startDate: i.startDate, endDate: i.endDate, type: i.type, zone: i.zone ?? 'A' });
    setEditId(i.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette interruption ?')) return;
    await deleteDoc(doc(db, 'interruptions', id));
    await load();
  };

  const toParisDate = (iso: string): string =>
    new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(iso));

  const importSchoolHolidays = async () => {
    setImporting(true);
    try {
      const year = new Date().getFullYear();
      const annee = `${year - 1}-${year}`;
      const zone = `Zone ${schoolZone}`;
      const apiUrl = new URL('https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records');
      apiUrl.searchParams.set('limit', '100');
      apiUrl.searchParams.set('where', `zones="${zone}" AND annee_scolaire="${annee}"`);
      const res = await fetch(apiUrl.toString());
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const records: SchoolHolidayRecord[] = data.results ?? [];

      // Dédoublonner par période (même description + même date de début)
      const seen = new Map<string, SchoolHolidayRecord>();
      for (const r of records) {
        const key = `${r.description}|${r.start_date.slice(0, 10)}`;
        if (!seen.has(key)) seen.set(key, r);
      }
      const unique = Array.from(seen.values());

      const batch = writeBatch(db);
      for (const r of unique) {
        const ref = doc(collection(db, 'interruptions'));
        batch.set(ref, {
          label: r.description,
          startDate: toParisDate(r.start_date),
          endDate: toParisDate(r.end_date),
          type: 'school_holiday',
          zone: schoolZone,
          annee_scolaire: r.annee_scolaire,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      await load();
      alert(`${unique.length} périodes importées pour la zone ${schoolZone} (${annee}).`);
    } catch (err) {
      alert(`Erreur lors de l'import : ${err}`);
    }
    setImporting(false);
  };

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50';
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Interruptions</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {editId ? 'Modifier' : 'Nouvelle interruption'}
        </h2>
        <div>
          <label className={labelCls}>Libellé</label>
          <input type="text" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} required placeholder="ex : Vacances de Noël" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Début</label>
            <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Fin</label>
            <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} required className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Type</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as 'school_holiday' | 'manual' }))} className={inputCls}>
              <option value="manual">Fermeture manuelle</option>
              <option value="school_holiday">Vacances scolaires</option>
            </select>
          </div>
          {form.type === 'school_holiday' && (
            <div>
              <label className={labelCls}>Zone</label>
              <select value={form.zone} onChange={e => setForm(p => ({ ...p, zone: e.target.value as 'A' | 'B' | 'C' }))} className={inputCls}>
                <option value="A">Zone A</option>
                <option value="B">Zone B</option>
                <option value="C">Zone C</option>
              </select>
            </div>
          )}
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

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-800">Import automatique — vacances scolaires</p>
          <p className="text-xs text-blue-600 mt-0.5">Importe les vacances scolaires depuis data.education.gouv.fr (zone {schoolZone}, année courante)</p>
        </div>
        <button
          onClick={importSchoolHolidays}
          disabled={importing}
          className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm whitespace-nowrap"
        >
          {importing ? 'Import…' : `Importer zone ${schoolZone}`}
        </button>
      </div>

      {loading ? <p className="text-gray-500 text-sm">Chargement…</p> : (
        <div className="space-y-3">
          {interruptions.length === 0 && <p className="text-gray-400 text-sm">Aucune interruption.</p>}
          {interruptions.map(i => (
            <div key={i.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{i.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${i.type === 'school_holiday' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    {i.type === 'school_holiday' ? `Vacances zone ${i.zone}` : 'Manuel'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{i.startDate} → {i.endDate}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(i)} className="text-sm text-blue-600 hover:underline">Modifier</button>
                <button onClick={() => handleDelete(i.id)} className="text-sm text-red-500 hover:underline">Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
