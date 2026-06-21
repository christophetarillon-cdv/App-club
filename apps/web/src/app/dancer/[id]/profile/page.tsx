'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, db } from '@/lib/firebase';
import { updateDancer } from '@/lib/auth';
import type { UpdateDancerInput } from '@/lib/auth';
import type { Dancer, ProfileFieldsConfig, CustomField, CustomFieldRole } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS, ROLE_PRIORITY } from '@cdv/types';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { z } from 'zod';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: { seconds: number } | undefined): string {
  if (!ts) return '';
  return new Date(ts.seconds * 1000).toISOString().split('T')[0] ?? '';
}

function mergeWithDefaults(saved: Partial<ProfileFieldsConfig> | undefined): ProfileFieldsConfig {
  const result = { ...DEFAULT_PROFILE_FIELDS };
  if (saved) {
    for (const key of Object.keys(DEFAULT_PROFILE_FIELDS) as (keyof ProfileFieldsConfig)[]) {
      if (saved[key]) result[key] = { ...DEFAULT_PROFILE_FIELDS[key], ...saved[key] };
    }
  }
  return result;
}

function buildZodSchema(fields: CustomField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    let v: z.ZodTypeAny;
    switch (field.type) {
      case 'text': case 'long_text': case 'date': case 'select':
        v = field.required ? z.string().min(1, 'Champ requis') : z.string().optional();
        break;
      case 'number':
        v = field.required
          ? z.coerce.number()
          : z.union([z.coerce.number(), z.literal('')]).optional();
        break;
      case 'multiselect':
        v = field.required ? z.array(z.string()).min(1, 'Au moins une option requise') : z.array(z.string()).optional();
        break;
      case 'checkbox':
        v = z.boolean().optional();
        break;
      case 'file':
        v = field.required ? z.string().min(1, 'Fichier requis') : z.string().optional();
        break;
      default:
        v = z.unknown();
    }
    shape[field.key] = v;
  }
  return z.object(shape);
}

// ── Rendu d'un champ custom ───────────────────────────────────────────────────

function CustomFieldInput({
  field, value, onChange, onFileUpload, editable, error,
}: {
  field: CustomField;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
  onFileUpload: (field: CustomField, file: File) => void;
  editable: boolean;
  error?: string;
}) {
  const base = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50';
  const cls = editable ? `${base} border-gray-300` : `${base} border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed`;
  const v = value as any;

  let input: React.ReactNode;

  switch (field.type) {
    case 'text':
      input = <input type="text" value={v ?? ''} onChange={e => onChange(field.key, e.target.value)}
        required={field.required && editable} disabled={!editable} className={cls} />;
      break;
    case 'long_text':
      input = <textarea value={v ?? ''} onChange={e => onChange(field.key, e.target.value)}
        required={field.required && editable} disabled={!editable} rows={3}
        className={`${cls} resize-none`} />;
      break;
    case 'number':
      input = <input type="number" value={v ?? ''} onChange={e => onChange(field.key, e.target.value === '' ? '' : Number(e.target.value))}
        required={field.required && editable} disabled={!editable} className={cls} />;
      break;
    case 'date':
      input = <input type="date" value={v ?? ''} onChange={e => onChange(field.key, e.target.value)}
        required={field.required && editable} disabled={!editable} className={cls} />;
      break;
    case 'select':
      input = (
        <select value={v ?? ''} onChange={e => onChange(field.key, e.target.value)}
          required={field.required && editable} disabled={!editable} className={cls}>
          <option value="">— Choisir —</option>
          {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
      break;
    case 'multiselect': {
      const arr = Array.isArray(v) ? (v as string[]) : [];
      input = (
        <div className="space-y-1.5">
          {field.options.map(opt => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={arr.includes(opt)} disabled={!editable}
                onChange={e => onChange(field.key, e.target.checked ? [...arr, opt] : arr.filter(x => x !== opt))}
                className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'checkbox':
      input = (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!v} disabled={!editable}
            onChange={e => onChange(field.key, e.target.checked)}
            className="w-4 h-4 rounded" />
          <span className="text-sm text-gray-700">{field.label}</span>
        </label>
      );
      break;
    case 'file':
      input = (
        <div>
          {v && typeof v === 'string' && (
            <a href={v} target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 block mb-2">
              Fichier actuel ↗
            </a>
          )}
          {editable && (
            <input type="file"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFileUpload(field, f); }}
              className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          )}
        </div>
      );
      break;
    default:
      input = null;
  }

  return (
    <div>
      {field.type !== 'checkbox' && (
        <label className="block text-xs text-gray-500 mb-1">
          {field.label}{field.required && ' *'}
        </label>
      )}
      {input}
      {field.helpText && <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function DancerPersonalProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { dancers, loading: authLoading } = useAuth();
  const router = useRouter();

  const dancer: Dancer | undefined = dancers.find(d => d.id === id);

  // Config champs prédéfinis
  const [fieldConfig, setFieldConfig] = useState<ProfileFieldsConfig>(DEFAULT_PROFILE_FIELDS);

  // Champs prédéfinis
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [profession, setProfession] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [healthCertificate, setHealthCertificate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Champs custom
  const [customSchemaId, setCustomSchemaId] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  const [customSaving, setCustomSaving] = useState(false);
  const [customSaved, setCustomSaved] = useState(false);
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authLoading && !dancer) router.replace('/select-dancer');
  }, [authLoading, dancer, router]);

  const [pagePermissions, setPagePermissions] = useState<Record<string, string[]>>({});
  const userRoles = [...(account?.roles ?? []), ...(dancer?.roles ?? [])];
  const isAdmin = userRoles.includes('admin');
  const hasPerm = (permKey: string) => {
    if (!(permKey in pagePermissions)) return true;
    const allowed = pagePermissions[permKey] ?? [];
    return isAdmin || userRoles.some(r => allowed.includes(r));
  };

  // Charge les configs (prédéfinis + custom) selon le rôle principal du danseur
  useEffect(() => {
    if (!dancer) return;

    (async () => {
      const settingsSnap = await getDoc(doc(db, 'appSettings', 'main'));
      if (settingsSnap.exists()) {
        setFieldConfig(mergeWithDefaults(settingsSnap.data().profileFields));
        setPagePermissions((settingsSnap.data().pagePermissions ?? {}) as Record<string, string[]>);
      }

      const profileMapping: Record<string, { schemaId: string }> =
        settingsSnap.exists() ? (settingsSnap.data().profileMapping ?? {}) : {};

      // Rôle principal = rôle avec la priorité la plus haute
      const dancerRolesList = (dancer.roles ?? []) as string[];
      let primaryRole = '';
      let highestPriority = -1;
      for (const role of dancerRolesList) {
        const priority = ROLE_PRIORITY[role] ?? 0;
        if (priority > highestPriority) { highestPriority = priority; primaryRole = role; }
      }

      let sid: string | null = null;
      if (primaryRole && profileMapping[primaryRole]?.schemaId) {
        sid = profileMapping[primaryRole].schemaId;
      } else {
        const q = query(collection(db, 'profileSchemas'), where('isActive', '==', true), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) sid = snap.docs[0].id;
      }

      if (!sid) return;
      setCustomSchemaId(sid);
      const fieldsSnap = await getDocs(
        query(collection(db, 'profileSchemas', sid, 'fields'), orderBy('displayOrder'))
      );
      setCustomFields(fieldsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CustomField)));
    })();
  }, [dancer?.id]);

  // Initialise les valeurs depuis le danseur
  useEffect(() => {
    if (dancer) {
      setFirstName(dancer.firstName);
      setLastName(dancer.lastName);
      setPhone(dancer.phone ?? '');
      setAddress(dancer.address ?? '');
      setBirthDate(formatDate(dancer.birthDate as any));
      setGender(dancer.gender ?? '');
      setEmergencyName(dancer.emergencyContact?.name ?? '');
      setEmergencyPhone(dancer.emergencyContact?.phone ?? '');
      setProfession(dancer.profession ?? '');
      setMedicalNotes(dancer.medicalNotes ?? '');
      setHealthCertificate(dancer.healthCertificate ?? false);
      setCustomValues((dancer.customFields as Record<string, unknown>) ?? {});
    }
  }, [dancer?.id]);

  // Champs custom visibles et éditables pour ce danseur
  const dancerRoles = (dancer?.roles ?? []) as CustomFieldRole[];
  const visibleFields = customFields.filter(f =>
    f.visibility.length === 0 || f.visibility.some(r => dancerRoles.includes(r))
  );
  const editableFieldKeys = new Set(
    customFields.filter(f =>
      f.editability.length === 0 || f.editability.some(r => dancerRoles.includes(r))
    ).map(f => f.key)
  );

  // Grouper par catégorie
  const fieldsByCategory = visibleFields.reduce<Record<string, CustomField[]>>((acc, f) => {
    const cat = f.category ?? '';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  // Photo
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleUploadPhoto = async () => {
    if (!photoFile || !id) return;
    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `profile-photos/${id}/photo.jpg`);
      await uploadBytes(storageRef, photoFile, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(storageRef);
      await updateDancer(id, { photoUrl: url });
      setPhotoFile(null);
      setPhotoPreview(null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Champs prédéfinis
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dancer) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const updates: UpdateDancerInput = { firstName: firstName.trim(), lastName: lastName.trim() };
      if (fieldConfig.phone.enabled) updates.phone = phone.trim() || undefined;
      if (fieldConfig.address.enabled) updates.address = address.trim() || undefined;
      if (fieldConfig.birthDate.enabled && birthDate) updates.birthDate = new Date(birthDate);
      if (fieldConfig.gender.enabled) updates.gender = gender.trim() || undefined;
      if (fieldConfig.emergencyContact.enabled) {
        updates.emergencyContact = emergencyName.trim()
          ? { name: emergencyName.trim(), phone: emergencyPhone.trim() }
          : undefined;
      }
      if (fieldConfig.profession.enabled) updates.profession = profession.trim() || undefined;
      if (fieldConfig.medicalNotes.enabled) updates.medicalNotes = medicalNotes.trim() || undefined;
      if (fieldConfig.healthCertificate.enabled) updates.healthCertificate = healthCertificate;
      await updateDancer(dancer.id, updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  // Champs custom — upload fichier
  const handleCustomFileUpload = (field: CustomField, file: File) => {
    setPendingFiles(prev => ({ ...prev, [field.key]: file }));
    const previewUrl = URL.createObjectURL(file);
    setCustomValues(prev => ({ ...prev, [field.key]: previewUrl }));
  };

  // Champs custom — sauvegarde
  const handleCustomSave = async () => {
    if (!dancer) return;

    // Validation Zod
    const schema = buildZodSchema(visibleFields.filter(f => editableFieldKeys.has(f.key)));
    const result = schema.safeParse(customValues);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string;
        if (key) errs[key] = issue.message;
      }
      setCustomErrors(errs);
      return;
    }
    setCustomErrors({});
    setCustomSaving(true);

    try {
      let finalValues = { ...customValues };

      // Upload les fichiers en attente
      for (const [key, file] of Object.entries(pendingFiles)) {
        const ext = file.name.split('.').pop() ?? 'bin';
        const storageRef = ref(storage, `custom-files/${dancer.id}/${key}.${ext}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        finalValues[key] = url;
      }

      await updateDoc(doc(db, 'dancers', dancer.id), {
        customFields: finalValues,
        updatedAt: serverTimestamp(),
      });

      setCustomValues(finalValues);
      setPendingFiles({});
      setCustomSaved(true);
      setTimeout(() => setCustomSaved(false), 2000);
    } finally {
      setCustomSaving(false);
    }
  };

  if (authLoading || !dancer) return null;

  const initials = `${dancer.firstName[0] ?? ''}${dancer.lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/dancer/${id}`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
          <h1 className="text-xl font-bold text-gray-900">Informations personnelles</h1>
        </div>

        {/* Photo */}
        {fieldConfig.photo.enabled && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
            <div className="flex items-center gap-4">
              {photoPreview || dancer.photoUrl ? (
                <img src={photoPreview ?? dancer.photoUrl} alt={dancer.firstName}
                  className="w-16 h-16 rounded-2xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-blue-500 flex items-center justify-center text-white text-xl font-bold">
                  {initials}
                </div>
              )}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ma photo</label>
                <input type="file" accept="image/*" onChange={handlePhotoChange}
                  className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              </div>
            </div>
            {photoFile && (
              <button onClick={handleUploadPhoto} disabled={uploadingPhoto}
                className="mt-3 w-full py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                {uploadingPhoto ? 'Upload…' : 'Enregistrer la photo'}
              </button>
            )}
          </div>
        )}

        {/* Liens rapides */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden mb-4">
          {[
            { href: `/dancer/${id}/card`, label: 'Ma carte de membre', permKey: '/dancer/card' },
            { href: '/membership', label: 'Ma cotisation', permKey: '/membership' },
            { href: `/dancer/${id}/levels`, label: 'Mes niveaux par style', permKey: '/dancer/levels' },
            { href: `/dancer/${id}/notifications`, label: 'Messages', permKey: '/dancer/notifications' },
            { href: `/dancer/${id}/settings`, label: 'Paramètres notifications', permKey: '/dancer/settings' },
            { href: '/my-documents', label: 'Mes documents', permKey: '/my-documents' },
            { href: '/library', label: 'Bibliothèque du club', permKey: '/library' },
          ].filter(item => hasPerm(item.permKey)).map((item, i) => (
            <Link key={i} href={item.href}
              className="flex items-center justify-between px-4 py-3.5 hover:bg-blue-50/50 transition-colors">
              <span className="text-sm text-gray-800 font-medium">{item.label}</span>
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        <Link href="/profile"
          className="flex items-center justify-center gap-2 w-full py-3 bg-white rounded-2xl border border-gray-200 shadow-sm text-sm text-gray-600 hover:bg-gray-50 transition-colors mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Ajouter un danseur
        </Link>

        <Link href="/profile"
          className="flex items-center justify-center gap-2 w-full py-3 bg-white rounded-2xl border border-gray-200 shadow-sm text-sm text-gray-600 hover:bg-gray-50 transition-colors mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Changer mon mot de passe
        </Link>

        {/* Formulaire champs prédéfinis */}
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prénom *</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nom *</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          </div>

          {fieldConfig.birthDate.enabled && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date de naissance{fieldConfig.birthDate.required && ' *'}</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                required={fieldConfig.birthDate.required}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          )}

          {fieldConfig.gender.enabled && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Genre{fieldConfig.gender.required && ' *'}</label>
              <select value={gender} onChange={e => setGender(e.target.value)}
                required={fieldConfig.gender.required}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white">
                <option value="">— Choisir —</option>
                <option value="Femme">Femme</option>
                <option value="Homme">Homme</option>
              </select>
            </div>
          )}

          {fieldConfig.phone.enabled && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Téléphone{fieldConfig.phone.required && ' *'}</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                required={fieldConfig.phone.required}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          )}

          {fieldConfig.address.enabled && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Adresse{fieldConfig.address.required && ' *'}</label>
              <input value={address} onChange={e => setAddress(e.target.value)}
                required={fieldConfig.address.required}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          )}

          {fieldConfig.emergencyContact.enabled && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact d'urgence{fieldConfig.emergencyContact.required && ' *'}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nom</label>
                  <input value={emergencyName} onChange={e => setEmergencyName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
                  <input type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
              </div>
            </div>
          )}

          {fieldConfig.profession.enabled && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Profession{fieldConfig.profession.required && ' *'}</label>
              <input value={profession} onChange={e => setProfession(e.target.value)}
                required={fieldConfig.profession.required}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          )}

          {fieldConfig.medicalNotes.enabled && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes médicales{fieldConfig.medicalNotes.required && ' *'}</label>
              <textarea value={medicalNotes} onChange={e => setMedicalNotes(e.target.value)}
                required={fieldConfig.medicalNotes.required} rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
            </div>
          )}

          {fieldConfig.healthCertificate.enabled && (
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={healthCertificate} onChange={e => setHealthCertificate(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded flex-shrink-0" />
              <span className="text-sm text-gray-700">
                Certificat médical fourni{fieldConfig.healthCertificate.required && <span className="text-red-500 ml-0.5">*</span>}
              </span>
            </label>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
          </button>
        </form>

        {/* Champs personnalisés */}
        {visibleFields.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Informations complémentaires</p>

            {Object.entries(fieldsByCategory).map(([category, catFields]) => (
              <div key={category} className="space-y-4">
                {category && (
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-t border-gray-100 pt-3">{category}</p>
                )}
                {catFields.map(field => (
                  <CustomFieldInput
                    key={field.id}
                    field={field}
                    value={customValues[field.key]}
                    onChange={(key, val) => setCustomValues(prev => ({ ...prev, [key]: val }))}
                    onFileUpload={handleCustomFileUpload}
                    editable={editableFieldKeys.has(field.key)}
                    error={customErrors[field.key]}
                  />
                ))}
              </div>
            ))}

            {Object.keys(customErrors).length > 0 && (
              <p className="text-xs text-red-500">Corrigez les erreurs avant d'enregistrer.</p>
            )}

            <button onClick={handleCustomSave} disabled={customSaving}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {customSaving ? 'Enregistrement…' : customSaved ? '✓ Enregistré' : 'Enregistrer les informations complémentaires'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
