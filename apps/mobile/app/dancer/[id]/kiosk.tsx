import { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Text, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { Colors } from '@/constants/Colors';

const KIOSK_URL = 'https://app-club-web.vercel.app/kiosk/setup';

export default function KioskScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [kioskUrl, setKioskUrl] = useState<string | null>(null);
  const [scanActive, setScanActive] = useState(false);

  const [exitCode, setExitCode] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // Récupère le custom token pour authentifier le web
        const createToken = httpsCallable(functions, 'createWebSessionToken');
        const result = await createToken({});
        const token = (result.data as any).token;

        // Construit l'URL avec le token
        const url = new URL(KIOSK_URL);
        url.searchParams.set('token', token);
        setKioskUrl(url.toString());
      } catch {
        // Fallback : ouvre le kiosk sans token (affichera login)
        setKioskUrl(KIOSK_URL);
      }

      // Charge le code de sortie
      try {
        const snap = await getDoc(doc(db, 'appSettings', 'main'));
        setExitCode(snap.data()?.kioskExitCode || null);
      } catch {
        setExitCode(null);
      }
    };

    init();
  }, []);

  const requestExit = () => {
    if (!exitCode) { router.back(); return; }
    setCodeInput(''); setCodeError(false); setShowCodeModal(true);
  };

  const handleConfirmCode = () => {
    if (codeInput.trim() === exitCode) {
      setShowCodeModal(false);
      router.back();
    } else {
      setCodeError(true);
    }
  };

  return (
    <View style={styles.root}>
      {kioskUrl && (
        <WebView
          ref={webviewRef}
          source={{ uri: kioskUrl }}
          style={styles.webview}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(navState) => {
            setScanActive(/\/kiosk\/[^/]+\/(scan|search)(\?|$)/.test(navState.url));
          }}
          mediaCapturePermissionGrantType="grant"
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
        />
      )}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      )}
      {!scanActive && (
        <TouchableOpacity
          style={[styles.backBtn, { top: insets.top + 12 }]}
          onPress={requestExit}
          activeOpacity={0.8}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 18l-6-6 6-6" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      )}

      <Modal visible={showCodeModal} transparent animationType="fade" onRequestClose={() => setShowCodeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Code requis</Text>
            <Text style={styles.modalSubtitle}>Entre le code pour quitter le kiosque.</Text>
            <TextInput
              value={codeInput}
              onChangeText={t => { setCodeInput(t); setCodeError(false); }}
              keyboardType="number-pad"
              secureTextEntry
              autoFocus
              style={[styles.codeInput, codeError && styles.codeInputError]}
              placeholder="Code"
            />
            {codeError && <Text style={styles.errorText}>Code incorrect.</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowCodeModal(false)} style={styles.modalBtnGhost}>
                <Text style={styles.modalBtnGhostText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirmCode} style={styles.modalBtnPrimary}>
                <Text style={styles.modalBtnPrimaryText}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  backBtn: {
    position: 'absolute', left: 12,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 3,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', maxWidth: 320, backgroundColor: '#fff', borderRadius: 16, padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 14 },
  codeInput: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, letterSpacing: 4, textAlign: 'center',
  },
  codeInputError: { borderColor: '#EF4444' },
  errorText: { color: '#EF4444', fontSize: 12, marginTop: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  modalBtnGhost: { paddingHorizontal: 14, paddingVertical: 9 },
  modalBtnGhostText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  modalBtnPrimary: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  modalBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
