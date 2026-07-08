import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  TextInput, Image, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { signOut, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from 'firebase/auth';
import {
  doc, updateDoc, addDoc, getDoc, getDocs,
  query, orderBy, where, limit,
  collection, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import * as ImagePicker from 'expo-image-picker';
import { auth, db, storage, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import BottomTabBar from '@/components/BottomTabBar';
import DateField from '@/components/DateField';
import type { ProfileFieldsConfig, ProfileFieldKey, CustomField, Dancer } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS } from '@cdv/types';

// ── Types locaux ──────────────────────────────────────────────────────────────

type CustomFieldWithEdit = CustomField & { canEdit: boolean };

// ── Config profileFields ──────────────────────────────────────────────────────

function mergeWithDefaults(saved: Partial<ProfileFieldsConfig> | undefined): ProfileFieldsConfig {
  const result = { ...DEFAULT_PROFILE_FIELDS };
  if (!saved) return result;
  for (const key of Object.keys(saved) as ProfileFieldKey[]) {
    if (result[key] && saved[key]) result[key] = { ...result[key], ...saved[key] };
  }
  return result;
}

// ── Utilitaires date ──────────────────────────────────────────────────────────

function tsToIso(ts: { seconds: number } | undefined): string {
  if (!ts) return '';
  const d = new Date(ts.seconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string | null {
  const parts = display.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return null;
  const date = new Date(+y, +m - 1, +d);
  if (isNaN(date.getTime())) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ── Composants utilitaires partagés ──────────────────────────────────────────

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {required && <Text style={styles.requiredStar}> *</Text>}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry,
  editable = true, autoCapitalize = 'none', required, multiline, showToggle }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; secureTextEntry?: boolean; editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; required?: boolean; multiline?: boolean;
  showToggle?: boolean;
}) {
  const [secure, setSecure] = useState(secureTextEntry ?? false);

  return (
    <View>
      <FieldLabel label={label} required={required} />
      {showToggle ? (
        <View style={styles.inputPw}>
          <TextInput
            style={[styles.inputPwInner, !editable && styles.inputDisabled]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder ?? '—'}
            placeholderTextColor={Colors.textLight}
            secureTextEntry={secure}
            editable={editable}
            autoCorrect={false}
            autoCapitalize={autoCapitalize}
          />
          <TouchableOpacity onPress={() => setSecure(v => !v)} style={styles.inputPwToggle} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              {secure ? (
                <>
                  <Path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" stroke={Colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" stroke={Colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M1 1l22 22" stroke={Colors.textLight} strokeWidth={1.8} strokeLinecap="round" />
                </>
              ) : (
                <>
                  <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={Colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  <Circle cx={12} cy={12} r={3} stroke={Colors.textLight} strokeWidth={1.8} />
                </>
              )}
            </Svg>
          </TouchableOpacity>
        </View>
      ) : (
        <TextInput
          style={[styles.input, !editable && styles.inputDisabled, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? '—'}
          placeholderTextColor={Colors.textLight}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          editable={editable}
          autoCorrect={false}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
          textAlignVertical={multiline ? 'top' : undefined}
        />
      )}
    </View>
  );
}

const GENDER_OPTIONS = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
];

function GenderPicker({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <View>
      <FieldLabel label="Genre" required={required} />
      <View style={styles.chipsRow}>
        {GENDER_OPTIONS.map(opt => (
          <TouchableOpacity key={opt.value}
            style={[styles.chip, value === opt.value && styles.chipActive]}
            onPress={() => onChange(value === opt.value ? '' : opt.value)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, value === opt.value && styles.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ConsentRow({ label, value, onChange, required, helpText }: {
  label: string; value: boolean; onChange: (v: boolean) => void; required?: boolean; helpText?: string;
}) {
  return (
    <View style={styles.consentRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.consentLabel}>{label}{required ? <Text style={styles.requiredStar}> *</Text> : null}</Text>
        {helpText ? <Text style={styles.helpText}>{helpText}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.primary }} thumbColor="#fff" />
    </View>
  );
}

// ── Rendu d'un champ custom ───────────────────────────────────────────────────

function CustomFieldInput({ field, value, onChange }: {
  field: CustomFieldWithEdit;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const readOnly = !field.canEdit;
  const strVal = typeof value === 'string' ? value : '';
  const boolVal = typeof value === 'boolean' ? value : false;
  const arrVal = Array.isArray(value) ? (value as string[]) : [];

  switch (field.type) {
    case 'text':
      return (
        <View>
          <FieldLabel label={field.label} required={field.required} />
          {field.helpText ? <Text style={styles.helpText}>{field.helpText}</Text> : null}
          <TextInput
            style={[styles.input, readOnly && styles.inputDisabled]}
            value={strVal}
            onChangeText={readOnly ? undefined : v => onChange(v)}
            editable={!readOnly}
            autoCorrect={false}
            autoCapitalize="sentences"
            placeholder="—"
            placeholderTextColor={Colors.textLight}
          />
        </View>
      );

    case 'long_text':
      return (
        <View>
          <FieldLabel label={field.label} required={field.required} />
          {field.helpText ? <Text style={styles.helpText}>{field.helpText}</Text> : null}
          <TextInput
            style={[styles.input, styles.inputMultiline, readOnly && styles.inputDisabled]}
            value={strVal}
            onChangeText={readOnly ? undefined : v => onChange(v)}
            editable={!readOnly}
            autoCorrect={false}
            autoCapitalize="sentences"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            placeholder="—"
            placeholderTextColor={Colors.textLight}
          />
        </View>
      );

    case 'number':
      return (
        <View>
          <FieldLabel label={field.label} required={field.required} />
          {field.helpText ? <Text style={styles.helpText}>{field.helpText}</Text> : null}
          <TextInput
            style={[styles.input, readOnly && styles.inputDisabled]}
            value={strVal}
            onChangeText={readOnly ? undefined : v => onChange(v)}
            editable={!readOnly}
            keyboardType="numeric"
            placeholder="—"
            placeholderTextColor={Colors.textLight}
          />
        </View>
      );

    case 'date':
      return (
        <View>
          <FieldLabel label={field.label} required={field.required} />
          {field.helpText ? <Text style={styles.helpText}>{field.helpText}</Text> : null}
          <TextInput
            style={[styles.input, readOnly && styles.inputDisabled]}
            value={strVal}
            onChangeText={readOnly ? undefined : v => onChange(v)}
            editable={!readOnly}
            keyboardType="numbers-and-punctuation"
            placeholder="jj/mm/aaaa"
            placeholderTextColor={Colors.textLight}
          />
        </View>
      );

    case 'select':
      return (
        <View>
          <FieldLabel label={field.label} required={field.required} />
          {field.helpText ? <Text style={styles.helpText}>{field.helpText}</Text> : null}
          <View style={[styles.chipsRow, { flexWrap: 'wrap' }]}>
            {field.options.map(opt => (
              <TouchableOpacity key={opt}
                style={[styles.chip, strVal === opt && styles.chipActive]}
                onPress={() => !readOnly && onChange(strVal === opt ? '' : opt)}
                activeOpacity={readOnly ? 1 : 0.75}
              >
                <Text style={[styles.chipText, strVal === opt && styles.chipTextActive]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );

    case 'multiselect':
      return (
        <View>
          <FieldLabel label={field.label} required={field.required} />
          {field.helpText ? <Text style={styles.helpText}>{field.helpText}</Text> : null}
          <View style={[styles.chipsRow, { flexWrap: 'wrap' }]}>
            {field.options.map(opt => {
              const selected = arrVal.includes(opt);
              return (
                <TouchableOpacity key={opt}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => {
                    if (readOnly) return;
                    onChange(selected ? arrVal.filter(v => v !== opt) : [...arrVal, opt]);
                  }}
                  activeOpacity={readOnly ? 1 : 0.75}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );

    case 'checkbox':
      return (
        <View style={styles.consentRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.consentLabel}>
              {field.label}
              {field.required ? <Text style={styles.requiredStar}> *</Text> : null}
            </Text>
            {field.helpText ? <Text style={styles.helpText}>{field.helpText}</Text> : null}
          </View>
          <Switch
            value={boolVal}
            onValueChange={readOnly ? undefined : v => onChange(v)}
            disabled={readOnly}
            trackColor={{ true: Colors.primary }}
            thumbColor="#fff"
          />
        </View>
      );

    case 'file':
      return (
        <View>
          <FieldLabel label={field.label} required={field.required} />
          <Text style={[styles.helpText, { marginTop: 2 }]}>Upload de fichier non disponible sur mobile.</Text>
        </View>
      );

    default:
      return null;
  }
}

// ── Rôles priorité pour mapping ───────────────────────────────────────────────

const ROLE_PRIORITY: Record<string, number> = {
  admin: 5, bureau: 4, instructor: 3, member: 2, trial: 1,
};

// ── Écran principal ──────────────────────────────────────────────────────────

export default function InfosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, account, dancers } = useAuth();
  const { selectedDancer, clearDancer } = useDancer();

  // ── Config champs standard
  const [fieldConfig, setFieldConfig] = useState<ProfileFieldsConfig>(DEFAULT_PROFILE_FIELDS);

  // ── Champs dancer
  const [firstName, setFirstName]               = useState('');
  const [lastName, setLastName]                 = useState('');
  const [birthDate, setBirthDate]               = useState('');
  const [gender, setGender]                     = useState('');
  const [street, setStreet]                     = useState('');
  const [postalCode, setPostalCode]             = useState('');
  const [city, setCity]                         = useState('');
  const [emergencyName, setEmergencyName]       = useState('');
  const [emergencyPhone, setEmergencyPhone]     = useState('');
  const [profession, setProfession]             = useState('');
  const [medicalNotes, setMedicalNotes]         = useState('');
  const [healthCertificate, setHealthCertificate] = useState(false);
  const [photoUrl, setPhotoUrl]                 = useState<string | null>(null);

  // ── Champs account
  const [phone, setPhone]                         = useState('');
  const [marketingConsent, setMarketingConsent]   = useState(false);
  const [imageRightsConsent, setImageRightsConsent] = useState(false);

  // ── Champs custom
  const [customFields, setCustomFields]   = useState<CustomFieldWithEdit[]>([]);
  const [customValues, setCustomValues]   = useState<Record<string, unknown>>({});
  const [loadingCustom, setLoadingCustom] = useState(false);

  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── Photo
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ── Ajouter un danseur
  const [showAddDancer, setShowAddDancer] = useState(false);
  const [newFirstName, setNewFirstName]   = useState('');
  const [newLastName, setNewLastName]     = useState('');
  const [addingDancer, setAddingDancer]   = useState(false);

  // ── Mot de passe
  const [showPassword, setShowPassword] = useState(false);
  const [pwCurrent, setPwCurrent]       = useState('');
  const [pwNext, setPwNext]             = useState('');
  const [pwConfirm, setPwConfirm]       = useState('');
  const [pwSaving, setPwSaving]         = useState(false);
  const [pwError, setPwError]           = useState('');
  const [pwSaved, setPwSaved]           = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [delPassword, setDelPassword]             = useState('');
  const [delError, setDelError]                   = useState('');
  const [deleting, setDeleting]                   = useState(false);

  // ── Chargement config standard ────────────────────────────────────────────

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      if (snap.exists()) setFieldConfig(mergeWithDefaults(snap.data().profileFields));
    }).catch(() => {});
  }, []);

  // ── Init formulaire + champs custom quand le danseur change ───────────────

  useEffect(() => {
    if (!selectedDancer) return;
    setFirstName(selectedDancer.firstName ?? '');
    setLastName(selectedDancer.lastName ?? '');
    setBirthDate(isoToDisplay(tsToIso(selectedDancer.birthDate)));
    setGender(selectedDancer.gender ?? '');
    setStreet(selectedDancer.street ?? '');
    setPostalCode(selectedDancer.postalCode ?? '');
    setCity(selectedDancer.city ?? '');
    setEmergencyName(selectedDancer.emergencyContact?.name ?? '');
    setEmergencyPhone(selectedDancer.emergencyContact?.phone ?? '');
    setProfession(selectedDancer.profession ?? '');
    setMedicalNotes(selectedDancer.medicalNotes ?? '');
    setHealthCertificate(selectedDancer.healthCertificate ?? false);
    setPhotoUrl(selectedDancer.photoUrl ?? null);
    setCustomValues(selectedDancer.customFields ?? {});
    loadCustomFields(selectedDancer);
  }, [selectedDancer?.id]);

  useEffect(() => {
    if (!account) return;
    setPhone(account.phone ?? '');
    setMarketingConsent(account.marketingConsent ?? false);
    setImageRightsConsent(account.imageRightsConsent ?? false);
  }, [account?.uid]);

  // ── Chargement champs custom ──────────────────────────────────────────────

  const loadCustomFields = async (dancer: Dancer) => {
    setLoadingCustom(true);
    setCustomFields([]);
    try {
      // 1. Lire le mapping depuis appSettings
      const settingsSnap = await getDoc(doc(db, 'appSettings', 'main'));
      const profileMapping: Record<string, { schemaId: string }> =
        settingsSnap.exists() ? (settingsSnap.data().profileMapping ?? {}) : {};

      // 2. Trouver le schéma pour le rôle le plus prioritaire du danseur
      const sortedRoles = [...(dancer.roles ?? [])].sort(
        (a, b) => (ROLE_PRIORITY[b] ?? 0) - (ROLE_PRIORITY[a] ?? 0),
      );

      let schemaId: string | null = null;
      for (const role of sortedRoles) {
        if (profileMapping[role]?.schemaId) {
          schemaId = profileMapping[role].schemaId;
          break;
        }
      }

      // 3. Fallback : schéma actif par défaut
      if (!schemaId) {
        const schemaSnap = await getDocs(
          query(collection(db, 'profileSchemas'), where('isActive', '==', true), limit(1)),
        );
        schemaId = schemaSnap.docs[0]?.id ?? null;
      }

      if (!schemaId) return;

      // 4. Charger les champs du schéma
      const fieldsSnap = await getDocs(
        query(collection(db, 'profileSchemas', schemaId, 'fields'), orderBy('displayOrder')),
      );
      const allFields = fieldsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CustomField));
      const dancerRoles = dancer.roles ?? [];

      // 5. Filtrer par visibility + annoter canEdit
      const visible: CustomFieldWithEdit[] = allFields
        .filter(f => f.visibility.some(r => dancerRoles.includes(r as any)))
        .map(f => ({ ...f, canEdit: f.editability.some(r => dancerRoles.includes(r as any)) }));

      setCustomFields(visible);
    } catch (err) {
      console.error('loadCustomFields:', err);
    } finally {
      setLoadingCustom(false);
    }
  };

  // ── Grouper champs custom par catégorie ───────────────────────────────────

  const customFieldsByCategory = useMemo(() => {
    const groups = new Map<string, CustomFieldWithEdit[]>();
    for (const f of customFields) {
      const cat = f.category ?? '';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(f);
    }
    return Array.from(groups.entries());
  }, [customFields]);

  // ── Photo ─────────────────────────────────────────────────────────────────

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission requise', "Autorisez l'accès à la photothèque dans les réglages.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setUploadingPhoto(true);
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      const storageRef = ref(storage, `dancers/${selectedDancer!.id}/photo.jpg`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'dancers', selectedDancer!.id), { photoUrl: url, updatedAt: serverTimestamp() });
      setPhotoUrl(url);
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer la photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Enregistrer ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedDancer || !user) return;
    setSaveError('');

    // Validation champs standard requis
    const missing: string[] = [];
    if (fieldConfig.firstName.required && !firstName.trim()) missing.push('Prénom');
    if (fieldConfig.lastName.required && !lastName.trim()) missing.push('Nom');
    if (fieldConfig.phone.required && !phone.trim()) missing.push('Téléphone');
    if (fieldConfig.birthDate.required && !birthDate.trim()) missing.push('Date de naissance');
    if (fieldConfig.gender.required && !gender) missing.push('Genre');
    if (fieldConfig.street.required && !street.trim()) missing.push('Rue');
    if (fieldConfig.postalCode.required && !postalCode.trim()) missing.push('Code postal');
    if (fieldConfig.city.required && !city.trim()) missing.push('Ville');
    if (fieldConfig.profession.required && !profession.trim()) missing.push('Profession');

    // Validation champs custom requis
    for (const f of customFields) {
      if (!f.required || !f.canEdit) continue;
      const val = customValues[f.key];
      const isEmpty = val === undefined || val === null || val === '' ||
        (Array.isArray(val) && (val as unknown[]).length === 0);
      if (isEmpty) missing.push(f.label);
    }

    if (missing.length > 0) {
      setSaveError(`Champs obligatoires manquants : ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    setSaved(false);
    try {
      // Champs dancer standard
      const dancerUpdates: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        firstNameLower: firstName.trim().toLowerCase(),
        lastNameLower: lastName.trim().toLowerCase(),
        updatedAt: serverTimestamp(),
      };
      if (fieldConfig.birthDate.enabled) {
        const isoDate = birthDate ? displayToIso(birthDate) : null;
        if (isoDate) {
          const [y, m, d] = isoDate.split('-').map(Number);
          dancerUpdates.birthDate = new Date(y, m - 1, d);
        }
      }
      if (fieldConfig.gender.enabled)            dancerUpdates.gender = gender;
      if (fieldConfig.street.enabled)              dancerUpdates.street = street.trim();
      if (fieldConfig.postalCode.enabled)          dancerUpdates.postalCode = postalCode.trim();
      if (fieldConfig.city.enabled)                dancerUpdates.city = city.trim();
      if (fieldConfig.emergencyContact.enabled)   dancerUpdates.emergencyContact = { name: emergencyName.trim(), phone: emergencyPhone.trim() };
      if (fieldConfig.profession.enabled)         dancerUpdates.profession = profession.trim();
      if (fieldConfig.medicalNotes.enabled)        dancerUpdates.medicalNotes = medicalNotes.trim();
      if (fieldConfig.healthCertificate.enabled)  dancerUpdates.healthCertificate = healthCertificate;

      // Champs custom — convertir + fusionner avec les valeurs existantes non modifiables
      if (customFields.length > 0) {
        const processed: Record<string, unknown> = {};
        for (const f of customFields) {
          if (!f.canEdit) continue; // ne pas écraser les champs non éditables
          const val = customValues[f.key];
          if (f.type === 'number' && typeof val === 'string') {
            const n = parseFloat(val);
            processed[f.key] = isNaN(n) ? null : n;
          } else if (f.type === 'date' && typeof val === 'string' && val) {
            processed[f.key] = displayToIso(val) ?? val;
          } else {
            processed[f.key] = val ?? null;
          }
        }
        dancerUpdates.customFields = { ...(selectedDancer.customFields ?? {}), ...processed };
      }

      // Champs account
      const accountUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (fieldConfig.phone.enabled)              accountUpdates.phone = phone.trim();
      if (fieldConfig.marketingConsent.enabled)   accountUpdates.marketingConsent = marketingConsent;
      if (fieldConfig.imageRightsConsent.enabled) accountUpdates.imageRightsConsent = imageRightsConsent;

      await Promise.all([
        updateDoc(doc(db, 'dancers', selectedDancer.id), dancerUpdates),
        updateDoc(doc(db, 'accounts', user.uid), accountUpdates),
      ]);

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer les informations.");
    } finally {
      setSaving(false);
    }
  };

  // ── Ajouter un danseur ────────────────────────────────────────────────────

  const handleAddDancer = async () => {
    if (!user || !newFirstName.trim() || !newLastName.trim()) return;
    setAddingDancer(true);
    try {
      const dancerRef = await addDoc(collection(db, 'dancers'), {
        accountId: user.uid,
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        firstNameLower: newFirstName.trim().toLowerCase(),
        lastNameLower: newLastName.trim().toLowerCase(),
        isMinor: false,
        roles: ['member'],
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'accounts', user.uid), {
        dancerIds: arrayUnion(dancerRef.id),
        updatedAt: serverTimestamp(),
      });
      setNewFirstName('');
      setNewLastName('');
      setShowAddDancer(false);
      Alert.alert('Danseur ajouté', `${newFirstName.trim()} ${newLastName.trim()} a été ajouté au compte.`);
    } catch {
      Alert.alert('Erreur', "Impossible d'ajouter le danseur.");
    } finally {
      setAddingDancer(false);
    }
  };

  // ── Mot de passe ──────────────────────────────────────────────────────────

  const handleChangePassword = async () => {
    setPwError('');
    if (!pwCurrent || !pwNext || !pwConfirm) { setPwError('Remplissez tous les champs.'); return; }
    if (pwNext !== pwConfirm) { setPwError('Les nouveaux mots de passe ne correspondent pas.'); return; }
    if (pwNext.length < 6) { setPwError('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (!user?.email) return;
    setPwSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, pwCurrent);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, pwNext);
      setPwCurrent(''); setPwNext(''); setPwConfirm('');
      setPwSaved(true);
      setShowPassword(false);
      setTimeout(() => setPwSaved(false), 3000);
    } catch (e: any) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setPwError('Mot de passe actuel incorrect.');
      } else {
        setPwError('Erreur lors du changement de mot de passe.');
      }
    } finally {
      setPwSaving(false);
    }
  };

  // ── Compte ────────────────────────────────────────────────────────────────

  const handleChangeDancer = () => { clearDancer(); router.replace('/select-dancer'); };

  const handleSignOut = () => {
    Alert.alert('Se déconnecter', 'Confirmer la déconnexion ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  const handleDeleteAccount = async () => {
    if (!selectedDancer || !user) return;
    setDelError('');
    if (hasEmailProvider && !delPassword) {
      setDelError('Saisissez votre mot de passe pour confirmer.');
      return;
    }
    Alert.alert(
      'Supprimer mon compte',
      `Cette action est irréversible. Vos informations personnelles (${selectedDancer.firstName} ${selectedDancer.lastName}) seront définitivement anonymisées. Continuer ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              if (hasEmailProvider && user.email) {
                const credential = EmailAuthProvider.credential(user.email, delPassword);
                await reauthenticateWithCredential(user, credential);
              }
              const res = await httpsCallable<{ dancerId: string }, { accountDeleted: boolean }>(
                functions, 'deleteDancerAccount',
              )({ dancerId: selectedDancer.id });

              if (res.data.accountDeleted) {
                await signOut(auth);
                router.replace('/login');
              } else {
                clearDancer();
                router.replace('/select-dancer');
              }
            } catch (e: any) {
              if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
                setDelError('Mot de passe incorrect.');
              } else {
                setDelError('Erreur lors de la suppression. Réessayez.');
              }
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const initials = selectedDancer
    ? `${selectedDancer.firstName[0] ?? ''}${selectedDancer.lastName[0] ?? ''}`.toUpperCase()
    : '?';

  const hasEmailProvider = auth.currentUser?.providerData.some(p => p.providerId === 'password') ?? false;
  const hasConsentFields = fieldConfig.marketingConsent.enabled || fieldConfig.imageRightsConsent.enabled;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <LinearGradient
          colors={['#2F86C0', '#2F86C0', '#7FBFE3', '#D8EAF3', Colors.background]}
          locations={[0, 0.32, 0.58, 0.8, 0.97]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerWave} pointerEvents="none">
          <Svg width="100%" height="100%" viewBox="0 0 400 44" preserveAspectRatio="none">
            <Path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" fill={Colors.background} />
          </Svg>
        </View>
        <TouchableOpacity style={styles.headerRow} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.headerTitle}>Mon profil</Text>
        </TouchableOpacity>
        <View style={styles.avatarRow}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatarPhoto} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          {selectedDancer && (
            <View>
              <Text style={styles.dancerName}>{selectedDancer.firstName} {selectedDancer.lastName}</Text>
              {account?.email && <Text style={styles.dancerEmail}>{account.email}</Text>}
            </View>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── 1. Informations personnelles ── */}
        <SectionTitle label="Informations personnelles" />
        <View style={styles.card}>

          {/* Photo */}
          {fieldConfig.photo.enabled && (
            <TouchableOpacity style={styles.photoRow} onPress={handlePickPhoto} activeOpacity={0.75} disabled={uploadingPhoto}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.photoThumb} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                    <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke={Colors.textSecondary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    <Circle cx={12} cy={13} r={4} stroke={Colors.textSecondary} strokeWidth={1.5} />
                  </Svg>
                </View>
              )}
              <Text style={styles.photoLabel}>
                Ma photo{fieldConfig.photo.required ? <Text style={styles.requiredStar}> *</Text> : null}
              </Text>
              {uploadingPhoto
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Text style={styles.photoAction}>Modifier</Text>}
            </TouchableOpacity>
          )}

          {fieldConfig.photo.enabled && <View style={styles.divider} />}

          <View style={styles.cardBody}>
            {/* Prénom + Nom */}
            <View style={styles.row2}>
              <View style={styles.col2}>
                <Field label="Prénom" value={firstName} onChangeText={setFirstName}
                  autoCapitalize="words" required={fieldConfig.firstName.required} />
              </View>
              <View style={styles.col2}>
                <Field label="Nom" value={lastName} onChangeText={setLastName}
                  autoCapitalize="words" required={fieldConfig.lastName.required} />
              </View>
            </View>

            {fieldConfig.birthDate.enabled && (
              <DateField label="Date de naissance" value={birthDate} onChangeText={setBirthDate}
                required={fieldConfig.birthDate.required} maximumDate={new Date()} />
            )}

            {fieldConfig.gender.enabled && (
              <GenderPicker value={gender} onChange={setGender} required={fieldConfig.gender.required} />
            )}

            {fieldConfig.phone.enabled && (
              <Field label="Téléphone" value={phone} onChangeText={setPhone}
                keyboardType="phone-pad" required={fieldConfig.phone.required} />
            )}

            {fieldConfig.street.enabled && (
              <Field label="Rue" value={street} onChangeText={setStreet}
                autoCapitalize="sentences" required={fieldConfig.street.required} />
            )}

            {fieldConfig.postalCode.enabled && (
              <Field label="Code postal" value={postalCode} onChangeText={setPostalCode}
                keyboardType="number-pad" required={fieldConfig.postalCode.required} />
            )}

            {fieldConfig.city.enabled && (
              <Field label="Ville" value={city} onChangeText={setCity}
                autoCapitalize="sentences" required={fieldConfig.city.required} />
            )}

            {fieldConfig.emergencyContact.enabled && (
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>
                  Contact d'urgence
                  {fieldConfig.emergencyContact.required ? <Text style={styles.requiredStar}> *</Text> : null}
                </Text>
                <View style={styles.row2}>
                  <View style={styles.col2}>
                    <Field label="Nom" value={emergencyName} onChangeText={setEmergencyName} autoCapitalize="words" />
                  </View>
                  <View style={styles.col2}>
                    <Field label="Téléphone" value={emergencyPhone} onChangeText={setEmergencyPhone} keyboardType="phone-pad" />
                  </View>
                </View>
              </View>
            )}

            {fieldConfig.profession.enabled && (
              <Field label="Profession" value={profession} onChangeText={setProfession}
                autoCapitalize="sentences" required={fieldConfig.profession.required} />
            )}

            {fieldConfig.medicalNotes.enabled && (
              <Field label="Notes médicales" value={medicalNotes} onChangeText={setMedicalNotes}
                autoCapitalize="sentences" required={fieldConfig.medicalNotes.required} multiline />
            )}

            {fieldConfig.healthCertificate.enabled && (
              <View style={styles.consentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.consentLabel}>
                    Certificat médical
                    {fieldConfig.healthCertificate.required ? <Text style={styles.requiredStar}> *</Text> : null}
                  </Text>
                </View>
                <Switch value={healthCertificate} onValueChange={setHealthCertificate}
                  trackColor={{ true: Colors.primary }} thumbColor="#fff" />
              </View>
            )}

            {hasConsentFields && (
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>Consentements</Text>
                {fieldConfig.marketingConsent.enabled && (
                  <ConsentRow label="Communications marketing"
                    value={marketingConsent} onChange={setMarketingConsent}
                    required={fieldConfig.marketingConsent.required} />
                )}
                {fieldConfig.imageRightsConsent.enabled && (
                  <ConsentRow label="Droits à l'image"
                    value={imageRightsConsent} onChange={setImageRightsConsent}
                    required={fieldConfig.imageRightsConsent.required} />
                )}
              </View>
            )}

            {/* ── Champs custom ── */}
            {loadingCustom && (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            )}

            {!loadingCustom && customFieldsByCategory.length > 0 && (
              <>
                {customFieldsByCategory.map(([cat, fields]) => (
                  <View key={cat || '_default'} style={cat ? styles.subSection : styles.customFieldGroup}>
                    {cat ? <Text style={styles.subSectionTitle}>{cat}</Text> : null}
                    {fields.map(f => (
                      <CustomFieldInput
                        key={f.id}
                        field={f}
                        value={customValues[f.key]}
                        onChange={v => setCustomValues(prev => ({ ...prev, [f.key]: v }))}
                      />
                    ))}
                  </View>
                ))}
              </>
            )}
          </View>

          <View style={styles.divider} />
          <View style={styles.cardFooter}>
            {saveError ? <Text style={[styles.errorText, { marginBottom: 10 }]}>{saveError}</Text> : null}
            <TouchableOpacity
              style={[styles.btnPrimary, saving && styles.btnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.btnPrimaryText}>
                {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 2. Mes danseurs ── */}
        <SectionTitle label="Mes danseurs" />
        <View style={styles.card}>
          {dancers.map((d, i) => (
            <View key={d.id}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.dancerListRow}>
                <View style={styles.dancerAvatar}>
                  <Text style={styles.dancerAvatarText}>
                    {`${d.firstName[0] ?? ''}${d.lastName[0] ?? ''}`.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.dancerListName}>{d.firstName} {d.lastName}</Text>
                {d.isActive && (
                  <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>actif</Text></View>
                )}
              </View>
            </View>
          ))}

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => { setShowAddDancer(v => !v); setNewFirstName(''); setNewLastName(''); }}
            activeOpacity={0.75}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke={Colors.primary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={9} cy={7} r={4} stroke={Colors.primary} strokeWidth={1.8} />
              <Path d="M19 8v6M22 11h-6" stroke={Colors.primary} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
            <Text style={styles.toggleLabel}>Ajouter un danseur</Text>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d={showAddDancer ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} stroke={Colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>

          {showAddDancer && (
            <>
              <View style={styles.divider} />
              <View style={styles.cardBody}>
                <View style={styles.row2}>
                  <View style={styles.col2}>
                    <Field label="Prénom *" value={newFirstName} onChangeText={setNewFirstName} autoCapitalize="words" />
                  </View>
                  <View style={styles.col2}>
                    <Field label="Nom *" value={newLastName} onChangeText={setNewLastName} autoCapitalize="words" />
                  </View>
                </View>
                <View style={styles.row2}>
                  <TouchableOpacity
                    style={[styles.col2, styles.btnPrimary, (addingDancer || !newFirstName.trim()) && styles.btnDisabled]}
                    onPress={handleAddDancer}
                    disabled={addingDancer || !newFirstName.trim()}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnPrimaryText}>{addingDancer ? 'Enregistrement…' : 'Enregistrer'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.col2, styles.btnSecondary]}
                    onPress={() => setShowAddDancer(false)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.btnSecondaryText}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── 3. Sécurité ── */}
        <SectionTitle label="Sécurité" />
        <View style={styles.card}>
          <View style={styles.cardBody}>
            <View>
              <FieldLabel label="Email de connexion" />
              <TextInput style={[styles.input, styles.inputDisabled]} value={user?.email ?? ''} editable={false} />
            </View>
          </View>

          {hasEmailProvider && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => { setShowPassword(v => !v); setPwError(''); setPwCurrent(''); setPwNext(''); setPwConfirm(''); }}
                activeOpacity={0.75}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z" stroke={Colors.textSecondary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M7 11V7a5 5 0 0110 0v4" stroke={Colors.textSecondary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text style={styles.toggleLabel}>{pwSaved ? '✓ Mot de passe modifié' : 'Changer le mot de passe'}</Text>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path d={showPassword ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} stroke={Colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>

              {showPassword && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.cardBody}>
                    <Field label="Mot de passe actuel" value={pwCurrent} onChangeText={setPwCurrent} secureTextEntry showToggle />
                    <Field label="Nouveau mot de passe" value={pwNext} onChangeText={setPwNext} secureTextEntry showToggle />
                    <Field label="Confirmer" value={pwConfirm} onChangeText={setPwConfirm} secureTextEntry showToggle />
                    {pwError ? <Text style={styles.errorText}>{pwError}</Text> : null}
                    <TouchableOpacity
                      style={[styles.btnPrimary, (pwSaving || !pwCurrent) && styles.btnDisabled]}
                      onPress={handleChangePassword}
                      disabled={pwSaving || !pwCurrent}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.btnPrimaryText}>{pwSaving ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}
        </View>

        {/* ── 4. Compte ── */}
        <SectionTitle label="Compte" />
        <View style={styles.card}>
          {dancers.length > 1 && (
            <>
              <TouchableOpacity style={styles.menuRow} onPress={handleChangeDancer} activeOpacity={0.75}>
                <View style={[styles.menuIcon, { backgroundColor: '#EDF4FF' }]}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                    <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#3B82F6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                    <Circle cx={9} cy={7} r={4} stroke="#3B82F6" strokeWidth={1.8} />
                    <Path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#3B82F6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
                <Text style={styles.menuLabel}>Changer de danseur</Text>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path d="M9 18l6-6-6-6" stroke="#ccc" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>
              <View style={styles.divider} />
            </>
          )}
          <TouchableOpacity style={styles.menuRow} onPress={handleSignOut} activeOpacity={0.75}>
            <View style={[styles.menuIcon, { backgroundColor: '#FFF0F0' }]}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="#EF4444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M16 17l5-5-5-5M21 12H9" stroke="#EF4444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <Text style={[styles.menuLabel, { color: '#EF4444' }]}>Se déconnecter</Text>
          </TouchableOpacity>
        </View>

        {/* ── 5. Zone de danger ── */}
        <SectionTitle label="Zone de danger" />
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => { setShowDeleteConfirm(v => !v); setDelError(''); setDelPassword(''); }}
            activeOpacity={0.75}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" stroke="#EF4444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={[styles.toggleLabel, { color: '#EF4444' }]}>Supprimer mon compte</Text>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d={showDeleteConfirm ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} stroke={Colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>

          {showDeleteConfirm && (
            <>
              <View style={styles.divider} />
              <View style={styles.cardBody}>
                <Text style={styles.helpText}>
                  Vos informations personnelles seront définitivement effacées. Les paiements et
                  adhésions déjà enregistrés sont conservés de façon anonyme pour les obligations
                  comptables du club.
                </Text>
                {hasEmailProvider && (
                  <Field label="Mot de passe" value={delPassword} onChangeText={setDelPassword} secureTextEntry showToggle />
                )}
                {delError ? <Text style={styles.errorText}>{delError}</Text> : null}
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#EF4444' }, deleting && styles.btnDisabled]}
                  onPress={handleDeleteAccount}
                  disabled={deleting}
                  activeOpacity={0.8}
                >
                  {deleting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.btnPrimaryText}>Supprimer définitivement mon compte</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

      </ScrollView>

      <BottomTabBar dancerId={id} bottomInset={insets.bottom} />
    </KeyboardAvoidingView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 56, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  avatarPhoto: { width: 52, height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  dancerName: { color: '#fff', fontSize: 17, fontWeight: '600' },
  dancerEmail: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },

  content: { paddingHorizontal: 20, paddingTop: 16 },

  sectionTitle: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16, marginLeft: 4 },

  card: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  cardBody: { padding: 14, gap: 12 },
  cardFooter: { padding: 14 },
  divider: { height: 0.5, backgroundColor: 'rgba(0,0,0,0.07)' },

  // Photo
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  photoThumb: { width: 44, height: 44, borderRadius: 12 },
  photoPlaceholder: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: Colors.border },
  photoLabel: { flex: 1, fontSize: 14, color: Colors.text },
  photoAction: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  // Champs
  fieldLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  requiredStar: { fontSize: 11, color: '#EF4444' },
  helpText: { fontSize: 11, color: Colors.textLight, marginBottom: 2 },
  input: { backgroundColor: Colors.background, borderWidth: 0.5, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: Colors.text },
  inputDisabled: { color: Colors.textLight },
  inputMultiline: { height: 72, paddingTop: 8 },
  inputPw: { backgroundColor: Colors.background, borderWidth: 0.5, borderColor: Colors.border, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  inputPwInner: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: Colors.text },
  inputPwToggle: { paddingRight: 10 },

  row2: { flexDirection: 'row', gap: 10 },
  col2: { flex: 1 },

  subSection: { borderTopWidth: 0.5, borderTopColor: Colors.border, paddingTop: 12, gap: 10 },
  subSectionTitle: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  customFieldGroup: { gap: 12 },

  // Chips (genre + champs custom select/multiselect)
  chipsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.background },
  chipActive: { backgroundColor: '#EFF6FF', borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.textSecondary },
  chipTextActive: { color: Colors.primary, fontWeight: '600' },

  // Consentements / checkbox
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  consentLabel: { fontSize: 14, color: Colors.text, lineHeight: 18 },

  // Toggle rows
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  toggleLabel: { flex: 1, fontSize: 14, color: Colors.text },

  // Danseurs
  dancerListRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingHorizontal: 14 },
  dancerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  dancerAvatarText: { fontSize: 12, fontWeight: '700', color: '#1E40AF' },
  dancerListName: { flex: 1, fontSize: 14, color: Colors.text },
  activeBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  activeBadgeText: { fontSize: 11, fontWeight: '600', color: '#065F46' },

  // Menu compte
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.text },

  // Boutons
  btnPrimary: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnSecondary: { backgroundColor: Colors.background, borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: Colors.border },
  btnSecondaryText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '500' },
  btnDisabled: { opacity: 0.5 },

  errorText: { fontSize: 13, color: '#EF4444' },
});
