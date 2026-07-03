import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { reauthenticateWithCredential, EmailAuthProvider, updatePassword, signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ForcePasswordChangeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (next.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (next !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    if (!user?.email) return;

    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, next);
      await updateDoc(doc(db, 'accounts', user.uid), { mustChangePassword: false });
      router.replace('/');
    } catch (e: any) {
      setError(
        e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
          ? 'Mot de passe actuel incorrect.'
          : 'Erreur lors du changement de mot de passe.',
      );
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Changement requis</Text>
          <Text style={styles.subtitle}>
            Pour des raisons de sécurité, choisissez un nouveau mot de passe avant de continuer.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Mot de passe provisoire</Text>
            <TextInput
              style={styles.input} value={current} onChangeText={setCurrent}
              placeholder="••••••••" placeholderTextColor={Colors.textLight} secureTextEntry
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Nouveau mot de passe</Text>
            <TextInput
              style={styles.input} value={next} onChangeText={setNext}
              placeholder="••••••••" placeholderTextColor={Colors.textLight} secureTextEntry
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Confirmer le mot de passe</Text>
            <TextInput
              style={styles.input} value={confirm} onChangeText={setConfirm}
              placeholder="••••••••" placeholderTextColor={Colors.textLight} secureTextEntry
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={saving || !current || !next || !confirm}
            activeOpacity={0.8}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Valider le nouveau mot de passe</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => signOut(auth)} style={styles.logout}>
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 8, textAlign: 'center' },
  form: { gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text,
  },
  error: { fontSize: 13, color: Colors.danger, textAlign: 'center' },
  button: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  logout: { alignItems: 'center', marginTop: 4 },
  logoutText: { fontSize: 12, color: Colors.textLight },
});
