'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, orderBy, query, doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PublicHoliday {
  id: string;
  date: string;
  label: string;
}

export default function PublicHolidaysPage() {
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    const q = query(collection(db, 'publicHolidays'), orderBy('date'));
    const snap = await getDocs(q);
    setHolidays(snap.docs.map(d => ({ id: d.id, date: d.data().date, label: d.data().label })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const importHolidays = async (year: number) => {
    setImporting(true);
    try {
      const res = await fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${year}.json`);
      if (!res.ok) throw new Error('Erreur API');
      const data: Record<string, string> = await res.json();
      const entries = Object.entries(data);

      const batch = writeBatch(db);
      for (const [date, label] of entries) {
        const ref = doc(db, 'publicHolidays', date);
        batch.set(ref, { date, label, year, updatedAt: serverTimestamp() });
      }
      await batch.commit();
      await load();
      alert(`${entries.length} jours fériés importés pour ${year}.`);
    } catch (err) {
      alert(`Erreur : ${err}`);
    }
    setImporting(false);
  };

  const currentYear = new Date().getFullYear();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Jours fériés</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-800">Import depuis calendrier.api.gouv.fr</p>
          <p className="text-xs text-blue-600 mt-0.5">Jours fériés métropole</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => importHolidays(currentYear)}
            disabled={importing}
            className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {importing ? 'Import…' : `Importer ${currentYear}`}
          </button>
          <button
            onClick={() => importHolidays(currentYear + 1)}
            disabled={importing}
            className="border border-blue-300 text-blue-700 font-semibold px-4 py-2 rounded-lg hover:bg-blue-100 disabled:opacity-50 text-sm"
          >
            {currentYear + 1}
          </button>
        </div>
      </div>

      {loading ? <p className="text-gray-500 text-sm">Chargement…</p> : (
        <div className="space-y-2">
          {holidays.length === 0 && (
            <p className="text-gray-400 text-sm">Aucun jour férié. Cliquez sur Importer pour charger l'année en cours.</p>
          )}
          {holidays.map(h => (
            <div key={h.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 flex items-center justify-between">
              <span className="font-medium text-gray-900">{h.label}</span>
              <span className="text-sm text-gray-400">{h.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
