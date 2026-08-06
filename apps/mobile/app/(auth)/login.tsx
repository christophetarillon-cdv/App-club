import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, functionsBaseUrl } from '@/lib/firebase';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import {
  isBiometricAvailable, getBiometricLabel, isBiometricEnabled,
  authenticateWithBiometric, getBiometricCredentials, saveBiometricCredentials,
} from '@/services/biometric.service';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biométrie');
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [saveBiometric, setSaveBiometric] = useState(false);

  useEffect(() => {
    const checkBiometric = async () => {
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      if (available) {
        const enabled = await isBiometricEnabled();
        setBiometricEnabled(enabled);
        const label = await getBiometricLabel();
        setBiometricLabel(label);
      }
    };
    checkBiometric();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      if (saveBiometric && biometricAvailable) {
        await saveBiometricCredentials(email.trim(), password);
      }
    } catch {
      setError('Email ou mot de passe incorrect.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    setError(null);
    try {
      const authenticated = await authenticateWithBiometric();
      if (!authenticated) {
        setError('Authentification échouée.');
        return;
      }
      const creds = await getBiometricCredentials();
      if (!creds) {
        setError('Aucune biométrie sauvegardée.');
        return;
      }
      await signInWithEmailAndPassword(auth, creds.email, creds.password);
    } catch {
      setError('Erreur lors de la connexion.');
    } finally {
      setBiometricLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setInfo(null);
      setError('Renseignez votre email ci-dessus pour recevoir le lien de réinitialisation.');
      return;
    }
    setError(null);
    setInfo(null);
    setResetLoading(true);
    try {
      const res = await fetch(`${functionsBaseUrl}/sendPasswordReset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInfo('Email envoyé — vérifiez votre boîte de réception.');
      } else if (data.error === 'user_not_found') {
        setError("Aucun compte n'est associé à cet email.");
      } else {
        setError("Impossible d'envoyer l'email pour le moment. Réessayez plus tard.");
      }
    } catch {
      setError('Erreur réseau — vérifiez votre connexion.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      // 120: tuned on-device, native resize alone doesn't lift enough under Android edge-to-edge (SDK 54+)
      keyboardVerticalOffset={Platform.OS === 'android' ? 120 : 0}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.club}>Club de Danse</Text>
          <Text style={styles.title}>CDCV</Text>
          <Text style={styles.subtitle}>Coublevie · Voiron</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="votre@email.com"
              placeholderTextColor={Colors.textLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Mot de passe</Text>
            <View style={styles.inputPw}>
              <TextInput
                style={styles.inputPwInner}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textLight}
                secureTextEntry={!showPw}
              />
              <TouchableOpacity onPress={() => setShowPw(v => !v)} style={styles.inputPwToggle} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  {!showPw ? (
                    <>
                      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={Colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                      <Circle cx={12} cy={12} r={3} stroke={Colors.textLight} strokeWidth={1.8} />
                    </>
                  ) : (
                    <>
                      <Path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" stroke={Colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                      <Path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" stroke={Colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                      <Path d="M1 1l22 22" stroke={Colors.textLight} strokeWidth={1.8} strokeLinecap="round" />
                    </>
                  )}
                </Svg>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleForgotPassword}
            disabled={resetLoading}
            style={styles.forgotLink}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.forgotLinkText}>
              {resetLoading ? 'Envoi en cours…' : 'Mot de passe oublié ?'}
            </Text>
          </TouchableOpacity>

          {info && <Text style={styles.info}>{info}</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          {biometricEnabled && (
            <TouchableOpacity
              style={[styles.buttonBiometric, biometricLoading && styles.buttonDisabled]}
              onPress={handleBiometricLogin}
              disabled={biometricLoading}
              activeOpacity={0.8}
            >
              {biometricLoading
                ? <ActivityIndicator color={Colors.primary} />
                : <Text style={styles.buttonBiometricText}>Se connecter avec {biometricLabel}</Text>
              }
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading || !email.trim() || !password}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Se connecter</Text>
            }
          </TouchableOpacity>

          {biometricAvailable && !biometricEnabled && (
            <TouchableOpacity
              style={styles.saveBiometricContainer}
              onPress={() => setSaveBiometric(!saveBiometric)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, saveBiometric && styles.checkboxChecked]}>
                {saveBiometric && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.saveBiometricText}>Sauvegarder la biométrie</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inner: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  club: {
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  inputPw: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputPwInner: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  inputPwToggle: {
    paddingRight: 14,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: -8,
  },
  forgotLinkText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  error: {
    fontSize: 13,
    color: Colors.danger,
    textAlign: 'center',
  },
  info: {
    fontSize: 13,
    color: Colors.success,
    textAlign: 'center',
  },
  buttonBiometric: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonBiometricText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  saveBiometricContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  saveBiometricText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
});
