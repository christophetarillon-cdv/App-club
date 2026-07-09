'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_PAYMENT_INFO } from '@cdv/types';

const FIELDS: { key: keyof typeof DEFAULT_PAYMENT_INFO; storageKey: string; label: string }[] = [
  { key: 'cheque', storageKey: 'paymentInfoCheque', label: 'Chèque' },
  { key: 'transfer', storageKey: 'paymentInfoTransfer', label: 'Virement' },
  { key: 'cash', storageKey: 'paymentInfoCash', label: 'Espèces' },
  { key: 'helloasso', storageKey: 'paymentInfoHelloasso', label: 'CB (HelloAsso)' },
];

export default function PaymentInfoSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      const data = snap.data() ?? {};
      const initial: Record<string, string> = {};
      for (const f of FIELDS) {
        initial[f.storageKey] = data[f.storageKey] ?? DEFAULT_PAYMENT_INFO[f.key];
      }
      setValues(initial);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    await setDoc(doc(db, 'appSettings', 'main'), values, { merge: true });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Informations de paiement</h1>
      <p className="text-sm text-gray-500 mb-6">
        Texte affiché aux danseurs entre le choix du mode de paiement et la saisie de leur règlement,
        pour chaque cotisation. Pour le virement, les coordonnées bancaires configurées dans
        "Comptes bancaires" sont ajoutées automatiquement en dessous du texte.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-6 max-w-2xl">
          {FIELDS.map(f => (
            <div key={f.storageKey}>
              <label className="block text-sm font-semibold text-gray-800 mb-1">{f.label}</label>
              <textarea
                value={values[f.storageKey] ?? ''}
                onChange={e => setValues(v => ({ ...v, [f.storageKey]: e.target.value }))}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />
            </div>
          ))}

          {saved && <p className="text-sm text-green-600">Enregistré.</p>}

          <button onClick={handleSave} disabled={saving}
            className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  );
}
