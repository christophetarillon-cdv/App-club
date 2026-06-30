'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, db, auth } from '@/lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { updateDancer, createDancer } from '@/lib/auth';
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
  const { user, dancers, account, loading: authLoading } = useAuth();
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

  const [showAddDancer, setShowAddDancer] = useState(false);
  const [newDancer, setNewDancer] = useState({ firstName: '', lastName: '' });
  const [addingDancer, setAddingDancer] = useState(false);

  const handleAddDancer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setAddingDancer(true);
    try {
      await createDancer(user.uid, { firstName: newDancer.firstName.trim(), lastName: newDancer.lastName.trim() });
      setNewDancer({ firstName: '', lastName: '' });
      setShowAddDancer(false);
    } finally {
      setAddingDancer(false);
    }
  };

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const hasEmailProvider = auth.currentUser?.providerData.some(p => p.providerId === 'password') ?? false;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { setPwError('Les mots de passe ne correspondent pas.'); return; }
    if (pwForm.next.length < 6) { setPwError('Le mot de passe doit faire au moins 6 caractères.'); return; }
    const email = auth.currentUser?.email;
    if (!email) return;
    setSavingPw(true); setPwError(null); setPwSaved(false);
    try {
      const credential = EmailAuthProvider.credential(email, pwForm.current);
      await reauthenticateWithCredential(auth.currentUser!, credential);
      await updatePassword(auth.currentUser!, pwForm.next);
      setPwForm({ current: '', next: '', confirm: '' });
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err: any) {
      setPwError(
        err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
          ? 'Mot de passe actuel incorrect.'
          : 'Erreur lors du changement de mot de passe.'
      );
    } finally {
      setSavingPw(false);
    }
  };
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

  const primaryRole = [...dancer.roles].sort((a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99))[0];
  const ROLE_BADGE: Record<string, { label: string; bg: string; text: string }> = {
    admin:      { label: 'Administrateur', bg: 'bg-blue-50',   text: 'text-blue-700' },
    bureau:     { label: 'Bureau',         bg: 'bg-purple-50', text: 'text-purple-700' },
    instructor: { label: 'Instructeur',    bg: 'bg-teal-50',   text: 'text-teal-700' },
    member:     { label: 'Membre',         bg: 'bg-green-50',  text: 'text-green-700' },
    trial:      { label: 'Essai',          bg: 'bg-amber-50',  text: 'text-amber-700' },
  };
  const badge = primaryRole ? (ROLE_BADGE[primaryRole] ?? { label: primaryRole, bg: 'bg-gray-100', text: 'text-gray-600' }) : null;

  const QUICK_LINKS = [
    { href: `/dancer/${id}/card`,          label: 'Ma carte de membre',  sub: 'QR code et infos adhésion',   permKey: '/dancer/card',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x={2} y={5} width={20} height={14} rx={2}/><line x1={2} y1={10} x2={22} y2={10}/></svg>,
      bg: 'bg-sky-50 text-sky-600' },
    { href: '/membership',                 label: 'Ma cotisation',        sub: 'Adhésion et paiements',       permKey: '/membership',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx={12} cy={8} r={4}/><path strokeLinecap="round" strokeLinejoin="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
      bg: 'bg-amber-50 text-amber-600' },
    { href: '/my-documents',               label: 'Mes documents',        sub: 'Reçus, attestations, factures', permKey: '/my-documents',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
      bg: 'bg-green-50 text-green-600' },
    { href: '/library',                    label: 'Bibliothèque du club', sub: 'Documents partagés',          permKey: '/library',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path strokeLinecap="round" strokeLinejoin="round" d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
      bg: 'bg-violet-50 text-violet-600' },
    ...(isAdmin ? [{
      href: '/admin/announcements',
      label: 'Actualités',
      sub: 'Publier des infos sur l\'accueil',
      permKey: '/admin/announcements',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>,
      bg: 'bg-orange-50 text-orange-600',
    }] : []),
  ].filter(item => hasPerm(item.permKey));

  const INPUT = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F9F7F4' }}>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-5 pt-5 pb-6">
          <Link href={`/dancer/${id}`}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Mon espace
          </Link>

          <div className="flex items-end gap-4">
            {/* Avatar cliquable */}
            {fieldConfig.photo.enabled ? (
              <label className="relative cursor-pointer shrink-0 group">
                <input type="file" accept="image/*" onChange={handlePhotoChange} className="sr-only" />
                {photoPreview ?? dancer.photoUrl ? (
                  <img src={photoPreview ?? dancer.photoUrl!} alt={dancer.firstName}
                    className="w-[72px] h-[72px] rounded-full object-cover ring-2 ring-white shadow" />
                ) : (
                  <div className="w-[72px] h-[72px] rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl font-semibold ring-2 ring-white shadow">
                    {initials}
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full bg-blue-600 flex items-center justify-center border-2 border-white group-hover:bg-blue-700 transition-colors">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                </div>
              </label>
            ) : (
              <div className="w-[72px] h-[72px] rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl font-semibold ring-2 ring-white shadow shrink-0">
                {initials}
              </div>
            )}

            {/* Nom + email + badge */}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold text-gray-900 truncate">{dancer.firstName} {dancer.lastName}</h1>
              {auth.currentUser?.email && (
                <p className="text-sm text-gray-400 mt-0.5 truncate">{auth.currentUser.email}</p>
              )}
              {badge && (
                <span className={`mt-2 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                  {badge.label}
                </span>
              )}
            </div>
          </div>

          {photoFile && (
            <button onClick={handleUploadPhoto} disabled={uploadingPhoto}
              className="mt-4 w-full py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {uploadingPhoto ? 'Upload en cours…' : 'Enregistrer la photo'}
            </button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5 pb-12">

        {/* ── Accès rapide ───────────────────────────────────────────────── */}
        {QUICK_LINKS.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Accès rapide</p>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
              {QUICK_LINKS.map((item, i) => (
                <Link key={i} href={item.href}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-blue-50/40 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.bg}`}>
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Mes danseurs ───────────────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Mes danseurs</p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4">
            <div className="flex items-center gap-3 flex-wrap">
              {dancers.map(d => {
                const di = `${d.firstName[0] ?? ''}${d.lastName[0] ?? ''}`.toUpperCase();
                const isActive = d.id === id;
                return (
                  <div key={d.id} className="flex flex-col items-center gap-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all
                      ${isActive ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400 ring-offset-1' : 'bg-gray-100 text-gray-600'}`}>
                      {di}
                    </div>
                    <span className="text-[10px] text-gray-500 text-center leading-tight max-w-[56px] truncate">{d.firstName}</span>
                  </div>
                );
              })}
              <button onClick={() => { setShowAddDancer(v => !v); setNewDancer({ firstName: '', lastName: '' }); }}
                className="flex flex-col items-center gap-1">
                <div className={`w-10 h-10 rounded-full border-2 border-dashed flex items-center justify-center text-lg font-light transition-colors
                  ${showAddDancer ? 'border-blue-400 text-blue-500' : 'border-gray-300 text-gray-400 hover:border-blue-300 hover:text-blue-400'}`}>
                  {showAddDancer ? '×' : '+'}
                </div>
                <span className="text-[10px] text-gray-400">{showAddDancer ? 'Annuler' : 'Ajouter'}</span>
              </button>
            </div>

            {showAddDancer && (
              <form onSubmit={handleAddDancer} className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Prénom</label>
                    <input type="text" value={newDancer.firstName}
                      onChange={e => setNewDancer(p => ({ ...p, firstName: e.target.value }))} required
                      className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nom</label>
                    <input type="text" value={newDancer.lastName}
                      onChange={e => setNewDancer(p => ({ ...p, lastName: e.target.value }))} required
                      className={INPUT} />
                  </div>
                </div>
                <button type="submit" disabled={addingDancer}
                  className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
                  {addingDancer ? 'Enregistrement…' : 'Créer le danseur'}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* ── Informations personnelles ───────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Informations personnelles</p>
          <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">

            {/* Identité */}
            <div className="p-4 space-y-3">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Identité</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Prénom *</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} required className={INPUT} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nom *</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} required className={INPUT} />
                </div>
              </div>
              {fieldConfig.birthDate.enabled && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date de naissance{fieldConfig.birthDate.required && ' *'}</label>
                  <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                    required={fieldConfig.birthDate.required} className={INPUT} />
                </div>
              )}
              {fieldConfig.gender.enabled && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Genre{fieldConfig.gender.required && ' *'}</label>
                  <select value={gender} onChange={e => setGender(e.target.value)}
                    required={fieldConfig.gender.required}
                    className={`${INPUT} appearance-none`}>
                    <option value="">— Choisir —</option>
                    <option value="Femme">Femme</option>
                    <option value="Homme">Homme</option>
                  </select>
                </div>
              )}
            </div>

            {/* Coordonnées */}
            {(fieldConfig.phone.enabled || fieldConfig.address.enabled) && (
              <div className="p-4 space-y-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Coordonnées</p>
                {fieldConfig.phone.enabled && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Téléphone{fieldConfig.phone.required && ' *'}</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      required={fieldConfig.phone.required} className={INPUT} />
                  </div>
                )}
                {fieldConfig.address.enabled && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Adresse{fieldConfig.address.required && ' *'}</label>
                    <input value={address} onChange={e => setAddress(e.target.value)}
                      required={fieldConfig.address.required} className={INPUT} />
                  </div>
                )}
              </div>
            )}

            {/* Contact d'urgence */}
            {fieldConfig.emergencyContact.enabled && (
              <div className="p-4 space-y-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Contact d'urgence{fieldConfig.emergencyContact.required && ' *'}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nom</label>
                    <input value={emergencyName} onChange={e => setEmergencyName(e.target.value)} className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
                    <input type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} className={INPUT} />
                  </div>
                </div>
              </div>
            )}

            {/* Profession */}
            {fieldConfig.profession.enabled && (
              <div className="p-4 space-y-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Profession</p>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Profession{fieldConfig.profession.required && ' *'}</label>
                  <input value={profession} onChange={e => setProfession(e.target.value)}
                    required={fieldConfig.profession.required} className={INPUT} />
                </div>
              </div>
            )}

            {/* Médical */}
            {(fieldConfig.medicalNotes.enabled || fieldConfig.healthCertificate.enabled) && (
              <div className="p-4 space-y-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Médical</p>
                {fieldConfig.medicalNotes.enabled && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Notes médicales{fieldConfig.medicalNotes.required && ' *'}</label>
                    <textarea value={medicalNotes} onChange={e => setMedicalNotes(e.target.value)}
                      required={fieldConfig.medicalNotes.required} rows={3}
                      className={`${INPUT} resize-none`} />
                  </div>
                )}
                {fieldConfig.healthCertificate.enabled && (
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input type="checkbox" checked={healthCertificate} onChange={e => setHealthCertificate(e.target.checked)}
                      className="w-4 h-4 rounded accent-blue-600" />
                    <span className="text-sm text-gray-700">
                      Certificat médical fourni{fieldConfig.healthCertificate.required && <span className="text-red-500 ml-0.5">*</span>}
                    </span>
                  </label>
                )}
              </div>
            )}

            {/* Bouton save */}
            <div className="p-4">
              {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
              <button type="submit" disabled={saving}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </section>

        {/* ── Informations complémentaires ───────────────────────────────── */}
        {visibleFields.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Informations complémentaires</p>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
              {Object.entries(fieldsByCategory).map(([category, catFields]) => (
                <div key={category} className="p-4 space-y-3">
                  {category && (
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{category}</p>
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
              <div className="p-4">
                {Object.keys(customErrors).length > 0 && (
                  <p className="text-xs text-red-500 mb-3">Corrigez les erreurs avant d'enregistrer.</p>
                )}
                <button onClick={handleCustomSave} disabled={customSaving}
                  className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {customSaving ? 'Enregistrement…' : customSaved ? '✓ Enregistré' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Compte ─────────────────────────────────────────────────────── */}
        {hasEmailProvider && (
          <section>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Compte</p>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Mot de passe</p>
                    <p className="text-xs text-gray-400">Sécurité du compte</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowPwForm(v => !v)}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                  {showPwForm ? 'Annuler' : 'Modifier'}
                </button>
              </div>

              {showPwForm && (
                <form onSubmit={handlePasswordSubmit} className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-50">
                  <div className="pt-3">
                    <label className="block text-xs text-gray-500 mb-1">Mot de passe actuel</label>
                    <input type="password" value={pwForm.current}
                      onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} required className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nouveau mot de passe</label>
                    <input type="password" value={pwForm.next}
                      onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} required className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Confirmer le nouveau mot de passe</label>
                    <input type="password" value={pwForm.confirm}
                      onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} required className={INPUT} />
                  </div>
                  {pwError && <p className="text-red-600 text-sm">{pwError}</p>}
                  {pwSaved && <p className="text-green-600 text-sm">Mot de passe mis à jour.</p>}
                  <button type="submit" disabled={savingPw}
                    className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {savingPw ? 'Mise à jour…' : 'Changer le mot de passe'}
                  </button>
                </form>
              )}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
