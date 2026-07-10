'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { ProfileFieldsConfig } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS } from '@cdv/types';
import { mergeProfileFieldsConfig, computeMissingDancerFields } from '@/lib/profileFields';
import { BirthDateSelect } from '@/components/BirthDateSelect';

const GENDER_OPTIONS = [
  { value: 'F', label: 'Femme' },
  { value: 'M', label: 'Homme' },
  { value: 'other', label: 'Autre' },
];

export default function CompleteProfilePage() {
  const router = useRouter();
  const { dancers } = useAuth();

  const [fieldConfig, setFieldConfig] = useState<ProfileFieldsConfig>(DEFAULT_PROFILE_FIELDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>({});

  const flaggedDancers = useMemo(() => dancers.filter(d => d.profileCompletionRequired), [dancers]);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      if (snap.exists()) setFieldConfig(mergeProfileFieldsConfig(snap.data().profileFields));
    }).finally(() => setLoading(false));
  }, []);

  const dancersMissing = useMemo(
    () => flaggedDancers
      .map(d => ({ dancer: d, fields: computeMissingDancerFields(d, fieldConfig) }))
      .filter(x => x.fields.length > 0),
    [flaggedDancers, fieldConfig],
  );

  useEffect(() => {
    setForm(prev => {
      const next = { ...prev };
      for (const { dancer } of dancersMissing) {
        const p = dancer.id;
        if (next[`${p}.street`] === undefined) next[`${p}.street`] = dancer.street ?? '';
        if (next[`${p}.postalCode`] === undefined) next[`${p}.postalCode`] = dancer.postalCode ?? '';
        if (next[`${p}.city`] === undefined) next[`${p}.city`] = dancer.city ?? '';
        if (next[`${p}.profession`] === undefined) next[`${p}.profession`] = dancer.profession ?? '';
        if (next[`${p}.medicalNotes`] === undefined) next[`${p}.medicalNotes`] = dancer.medicalNotes ?? '';
        if (next[`${p}.gender`] === undefined) next[`${p}.gender`] = dancer.gender ?? '';
        if (next[`${p}.birthDate`] === undefined) {
          next[`${p}.birthDate`] = dancer.birthDate
            ? new Date(dancer.birthDate.seconds * 1000).toISOString().slice(0, 10)
            : '';
        }
        if (next[`${p}.healthCertificate`] === undefined) next[`${p}.healthCertificate`] = dancer.healthCertificate ?? false;
        if (next[`${p}.emergencyName`] === undefined) next[`${p}.emergencyName`] = dancer.emergencyContact?.name ?? '';
        if (next[`${p}.emergencyPhone`] === undefined) next[`${p}.emergencyPhone`] = dancer.emergencyContact?.phone ?? '';
      }
      return next;
    });
  }, [dancersMissing]);

  const setFormValue = (key: string, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }));

  const isValid = (): boolean => {
    for (const { dancer, fields } of dancersMissing) {
      for (const f of fields) {
        if (f.key === 'emergencyContact') {
          if (!(form[`${dancer.id}.emergencyName`] as string)?.trim() || !(form[`${dancer.id}.emergencyPhone`] as string)?.trim()) return false;
        } else if (f.key === 'healthCertificate') {
          if (form[`${dancer.id}.healthCertificate`] !== true) return false;
        } else if (f.key === 'gender') {
          if (!form[`${dancer.id}.gender`]) return false;
        } else if (!(form[`${dancer.id}.${f.key}`] as string)?.trim()) {
          return false;
        }
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!isValid()) { alert('Merci de renseigner tous les champs.'); return; }
    setSaving(true);
    try {
      await Promise.all(dancersMissing.map(({ dancer, fields }) => {
        const p = dancer.id;
        const updates: Record<string, unknown> = { updatedAt: serverTimestamp(), profileCompletionRequired: false };
        for (const f of fields) {
          if (f.key === 'street') updates.street = (form[`${p}.street`] as string).trim();
          if (f.key === 'postalCode') updates.postalCode = (form[`${p}.postalCode`] as string).trim();
          if (f.key === 'city') updates.city = (form[`${p}.city`] as string).trim();
          if (f.key === 'profession') updates.profession = (form[`${p}.profession`] as string).trim();
          if (f.key === 'medicalNotes') updates.medicalNotes = (form[`${p}.medicalNotes`] as string).trim();
          if (f.key === 'gender') updates.gender = form[`${p}.gender`];
          if (f.key === 'healthCertificate') updates.healthCertificate = !!form[`${p}.healthCertificate`];
          if (f.key === 'emergencyContact') {
            updates.emergencyContact = {
              name: (form[`${p}.emergencyName`] as string).trim(),
              phone: (form[`${p}.emergencyPhone`] as string).trim(),
            };
          }
          if (f.key === 'birthDate') {
            const iso = form[`${p}.birthDate`] as string;
            if (iso) updates.birthDate = new Date(iso + 'T00:00:00');
          }
        }
        return updateDoc(doc(db, 'dancers', p), updates);
      }));
      const staleFlagged = flaggedDancers.filter(d => !dancersMissing.some(x => x.dancer.id === d.id));
      await Promise.all(staleFlagged.map(d => updateDoc(doc(db, 'dancers', d.id), { profileCompletionRequired: false })));
      router.replace('/');
    } catch {
      alert("Impossible d'enregistrer les informations.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-10 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Complétez votre fiche</h1>
          <p className="text-sm text-gray-500">
            Des informations obligatoires sont manquantes sur votre fiche (ou celle d'un membre de votre famille).
            Merci de les compléter pour continuer à utiliser l'application.
          </p>
        </div>

        {dancersMissing.map(({ dancer, fields }) => (
          <div key={dancer.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-3">
            <p className="font-semibold text-gray-900">{dancer.firstName} {dancer.lastName}</p>
            {fields.some(f => f.key === 'birthDate') && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date de naissance</label>
                <BirthDateSelect value={form[`${dancer.id}.birthDate`] as string ?? ''}
                  onChange={v => setFormValue(`${dancer.id}.birthDate`, v)} />
              </div>
            )}
            {fields.some(f => f.key === 'gender') && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Genre</label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setFormValue(`${dancer.id}.gender`, opt.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                        form[`${dancer.id}.gender`] === opt.value
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-300 text-gray-700'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {fields.some(f => f.key === 'street') && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Rue</label>
                <input type="text" value={form[`${dancer.id}.street`] as string ?? ''}
                  onChange={e => setFormValue(`${dancer.id}.street`, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            )}
            {fields.some(f => f.key === 'postalCode') && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Code postal</label>
                <input type="text" value={form[`${dancer.id}.postalCode`] as string ?? ''}
                  onChange={e => setFormValue(`${dancer.id}.postalCode`, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            )}
            {fields.some(f => f.key === 'city') && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ville</label>
                <input type="text" value={form[`${dancer.id}.city`] as string ?? ''}
                  onChange={e => setFormValue(`${dancer.id}.city`, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            )}
            {fields.some(f => f.key === 'profession') && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Profession</label>
                <input type="text" value={form[`${dancer.id}.profession`] as string ?? ''}
                  onChange={e => setFormValue(`${dancer.id}.profession`, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            )}
            {fields.some(f => f.key === 'emergencyContact') && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contact d'urgence — nom</label>
                  <input type="text" value={form[`${dancer.id}.emergencyName`] as string ?? ''}
                    onChange={e => setFormValue(`${dancer.id}.emergencyName`, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Téléphone</label>
                  <input type="tel" value={form[`${dancer.id}.emergencyPhone`] as string ?? ''}
                    onChange={e => setFormValue(`${dancer.id}.emergencyPhone`, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
              </div>
            )}
            {fields.some(f => f.key === 'medicalNotes') && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes médicales</label>
                <textarea value={form[`${dancer.id}.medicalNotes`] as string ?? ''}
                  onChange={e => setFormValue(`${dancer.id}.medicalNotes`, e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
              </div>
            )}
            {fields.some(f => f.key === 'healthCertificate') && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={!!form[`${dancer.id}.healthCertificate`]}
                  onChange={e => setFormValue(`${dancer.id}.healthCertificate`, e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded" />
                <span className="text-xs text-gray-600">Certificat médical fourni</span>
              </label>
            )}
          </div>
        ))}

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
          {saving ? 'Enregistrement…' : 'Enregistrer et continuer'}
        </button>
      </div>
    </div>
  );
}
