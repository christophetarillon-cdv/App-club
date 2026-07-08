import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ProfileFieldsConfig } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS } from '@cdv/types';
import { mergeProfileFieldsConfig, computeMissingDancerFields } from '@/lib/profileFields';

const GENDER_OPTIONS = [
  { value: 'F', label: 'Femme' },
  { value: 'M', label: 'Homme' },
  { value: 'other', label: 'Autre' },
];

function TextField({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.textFieldInput, multiline && { height: 72, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textLight}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
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

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function CompleteProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
            ? isoToDisplay(new Date(dancer.birthDate.seconds * 1000).toISOString().slice(0, 10))
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
        } else if (f.key === 'birthDate') {
          if (!displayToIso(form[`${dancer.id}.birthDate`] as string ?? '')) return false;
        } else {
          if (!(form[`${dancer.id}.${f.key}`] as string)?.trim()) return false;
        }
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!isValid()) {
      Alert.alert('Formulaire incomplet', 'Merci de renseigner tous les champs.');
      return;
    }
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
            const iso = displayToIso(form[`${p}.birthDate`] as string);
            if (iso) {
              const [y, m, d] = iso.split('-').map(Number);
              updates.birthDate = new Date(y!, m! - 1, d!);
            }
          }
        }
        return updateDoc(doc(db, 'dancers', p), updates);
      }));
      // Danseurs marqués mais sans champ réellement manquant (config
      // modifiée entre-temps) : on lève simplement le flag.
      const staleFlagged = flaggedDancers.filter(d => !dancersMissing.some(x => x.dancer.id === d.id));
      await Promise.all(staleFlagged.map(d => updateDoc(doc(db, 'dancers', d.id), { profileCompletionRequired: false })));
      router.replace('/');
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer les informations.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Complétez votre fiche</Text>
        <Text style={styles.intro}>
          Des informations obligatoires sont manquantes sur votre fiche (ou celle d'un membre de votre
          famille). Merci de les compléter pour continuer à utiliser l'application.
        </Text>

        {dancersMissing.map(({ dancer, fields }) => (
          <View key={dancer.id} style={styles.card}>
            <Text style={styles.cardTitle}>{dancer.firstName} {dancer.lastName}</Text>
            {fields.some(f => f.key === 'birthDate') && (
              <TextField label="Date de naissance (JJ/MM/AAAA)" value={form[`${dancer.id}.birthDate`] as string ?? ''}
                onChangeText={v => setFormValue(`${dancer.id}.birthDate`, v)} placeholder="JJ/MM/AAAA" />
            )}
            {fields.some(f => f.key === 'gender') && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Genre</Text>
                <View style={styles.chipsRow}>
                  {GENDER_OPTIONS.map(opt => {
                    const active = form[`${dancer.id}.gender`] === opt.value;
                    return (
                      <TouchableOpacity key={opt.value} style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setFormValue(`${dancer.id}.gender`, opt.value)} activeOpacity={0.75}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
            {fields.some(f => f.key === 'street') && (
              <TextField label="Rue" value={form[`${dancer.id}.street`] as string ?? ''} onChangeText={v => setFormValue(`${dancer.id}.street`, v)} />
            )}
            {fields.some(f => f.key === 'postalCode') && (
              <TextField label="Code postal" value={form[`${dancer.id}.postalCode`] as string ?? ''} onChangeText={v => setFormValue(`${dancer.id}.postalCode`, v)} keyboardType="number-pad" />
            )}
            {fields.some(f => f.key === 'city') && (
              <TextField label="Ville" value={form[`${dancer.id}.city`] as string ?? ''} onChangeText={v => setFormValue(`${dancer.id}.city`, v)} />
            )}
            {fields.some(f => f.key === 'profession') && (
              <TextField label="Profession" value={form[`${dancer.id}.profession`] as string ?? ''} onChangeText={v => setFormValue(`${dancer.id}.profession`, v)} />
            )}
            {fields.some(f => f.key === 'emergencyContact') && (
              <>
                <TextField label="Contact d'urgence — nom" value={form[`${dancer.id}.emergencyName`] as string ?? ''} onChangeText={v => setFormValue(`${dancer.id}.emergencyName`, v)} />
                <TextField label="Contact d'urgence — téléphone" value={form[`${dancer.id}.emergencyPhone`] as string ?? ''} onChangeText={v => setFormValue(`${dancer.id}.emergencyPhone`, v)} keyboardType="phone-pad" />
              </>
            )}
            {fields.some(f => f.key === 'medicalNotes') && (
              <TextField label="Notes médicales" value={form[`${dancer.id}.medicalNotes`] as string ?? ''} onChangeText={v => setFormValue(`${dancer.id}.medicalNotes`, v)} multiline />
            )}
            {fields.some(f => f.key === 'healthCertificate') && (
              <View style={styles.consentRow}>
                <Text style={styles.consentLabel}>Certificat médical fourni</Text>
                <Switch value={!!form[`${dancer.id}.healthCertificate`]} onValueChange={v => setFormValue(`${dancer.id}.healthCertificate`, v)} trackColor={{ true: Colors.primary }} thumbColor="#fff" />
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity style={[styles.primaryBtn, saving && styles.btnDisabled]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Enregistrer et continuer</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  intro: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 20 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.06)' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 5 },
  textFieldInput: { backgroundColor: Colors.background, borderWidth: 0.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.text },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 0.5, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  consentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  consentLabel: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
