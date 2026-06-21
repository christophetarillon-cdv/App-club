'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

interface FormData {
  officialName: string;
  shortName: string;
  legalStatus: string;
  mainPhone: string;
  mainEmail: string;
  websiteUrl: string;
  headquartersAddress: Address;
  logoUrl: string;
  primaryColor: string;
  shortDescription: string;
  siret: string;
  apeCode: string;
  associationNumber: string;
  presidentName: string;
  presidentSignatureUrl: string;
}

const emptyForm: FormData = {
  officialName: '',
  shortName: '',
  legalStatus: '',
  mainPhone: '',
  mainEmail: '',
  websiteUrl: '',
  headquartersAddress: { street: '', city: '', postalCode: '', country: 'France' },
  logoUrl: '',
  primaryColor: '#1B3A6B',
  shortDescription: '',
  siret: '',
  apeCode: '',
  associationNumber: '',
  presidentName: '',
  presidentSignatureUrl: '',
};

export default function ClubSettingsPage() {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setError('Firestore inaccessible — vérifiez que la base de données est activée dans la console Firebase.');
      setLoading(false);
    }, 8000);

    getDoc(doc(db, 'clubProfile', 'main'))
      .then((snap) => { if (snap.exists()) setForm({ ...emptyForm, ...snap.data() as FormData }); })
      .catch(() => setError('Impossible de charger le profil du club.'))
      .finally(() => { clearTimeout(timeout); setLoading(false); });

    return () => clearTimeout(timeout);
  }, []);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleAddressChange = (field: keyof Address, value: string) => {
    setForm((prev) => ({
      ...prev,
      headquartersAddress: { ...prev.headquartersAddress, [field]: value },
    }));
    setSaved(false);
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSignatureFile(file);
    setSignaturePreview(URL.createObjectURL(file));
    setSaved(false);
  };

  const handleUploadSignature = async () => {
    if (!signatureFile) return;
    setUploadingSignature(true);
    try {
      const sRef = storageRef(storage, `club/president-signature`);
      await uploadBytes(sRef, signatureFile, { contentType: signatureFile.type });
      const url = await getDownloadURL(sRef);
      setForm(prev => ({ ...prev, presidentSignatureUrl: url }));
      setSignatureFile(null);
      setSignaturePreview(null);
    } finally {
      setUploadingSignature(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'clubProfile', 'main'), {
        ...form,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true);
    } catch {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500 p-8">Chargement...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Paramètres du club</h1>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl p-6 shadow-sm border border-gray-200">

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Identité</h2>
          <Field label="Nom officiel" value={form.officialName} onChange={(v) => handleChange('officialName', v)} required />
          <Field label="Nom court" value={form.shortName} onChange={(v) => handleChange('shortName', v)} required />
          <Field label="Statut juridique" value={form.legalStatus} onChange={(v) => handleChange('legalStatus', v)} placeholder="ex : Association loi 1901" />
          <Field label="Description courte" value={form.shortDescription} onChange={(v) => handleChange('shortDescription', v)} multiline />
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Informations légales</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Numéro SIRET" value={form.siret} onChange={(v) => handleChange('siret', v)} placeholder="ex : 123 456 789 00012" />
            <Field label="Code APE" value={form.apeCode} onChange={(v) => handleChange('apeCode', v)} placeholder="ex : 9312Z" />
          </div>
          <Field label="N° d'association" value={form.associationNumber} onChange={(v) => handleChange('associationNumber', v)} placeholder="ex : W382000123" />
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Président·e</h2>
          <Field label="Nom du/de la président·e" value={form.presidentName} onChange={(v) => handleChange('presidentName', v)} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Signature</label>
            {(signaturePreview || form.presidentSignatureUrl) && (
              <div className="mb-3 p-3 bg-gray-50 rounded-lg inline-block">
                <img
                  src={signaturePreview ?? form.presidentSignatureUrl}
                  alt="Signature"
                  className="h-16 object-contain"
                />
              </div>
            )}
            <input type="file" accept="image/*" onChange={handleSignatureChange}
              className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            <p className="text-xs text-gray-400 mt-1">PNG avec fond transparent recommandé</p>
            {signatureFile && (
              <button type="button" onClick={handleUploadSignature} disabled={uploadingSignature}
                className="mt-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {uploadingSignature ? 'Upload…' : 'Enregistrer la signature'}
              </button>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Contact</h2>
          <Field label="Téléphone principal" value={form.mainPhone} onChange={(v) => handleChange('mainPhone', v)} type="tel" />
          <Field label="Email principal" value={form.mainEmail} onChange={(v) => handleChange('mainEmail', v)} type="email" required />
          <Field label="Site web" value={form.websiteUrl} onChange={(v) => handleChange('websiteUrl', v)} type="url" placeholder="https://" />
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Adresse du siège</h2>
          <Field label="Rue" value={form.headquartersAddress.street} onChange={(v) => handleAddressChange('street', v)} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code postal" value={form.headquartersAddress.postalCode} onChange={(v) => handleAddressChange('postalCode', v)} />
            <Field label="Ville" value={form.headquartersAddress.city} onChange={(v) => handleAddressChange('city', v)} />
          </div>
          <Field label="Pays" value={form.headquartersAddress.country} onChange={(v) => handleAddressChange('country', v)} />
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Apparence</h2>
          <Field label="URL du logo" value={form.logoUrl} onChange={(v) => handleChange('logoUrl', v)} placeholder="https://" />
          <div className="flex items-center gap-3">
            <label className="block text-sm font-medium text-gray-700">Couleur principale</label>
            <input
              type="color"
              value={form.primaryColor}
              onChange={(e) => handleChange('primaryColor', e.target.value)}
              className="h-9 w-16 rounded border border-gray-300 cursor-pointer"
            />
            <span className="text-sm text-gray-500">{form.primaryColor}</span>
          </div>
        </section>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {saved && <p className="text-green-600 text-sm">Sauvegardé avec succès.</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Sauvegarde...' : 'Enregistrer'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder, required, multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  const base = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50';
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className={base} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} className={base} />
      )}
    </div>
  );
}
