import { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Colors } from '@/constants/Colors';

const WEB_BASE_URL = 'https://espace-perso.clubdedanse.net';

export default function InstructorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    httpsCallable<void, { token: string }>(functions, 'createWebViewAuthToken')()
      .then(res => {
        const token = encodeURIComponent(res.data.token);
        const next = encodeURIComponent('/instructor');
        setUrl(`${WEB_BASE_URL}/mobile-auth?token=${token}&next=${next}`);
      })
      .catch(() => setUrl(`${WEB_BASE_URL}/instructor`));
  }, []);

  return (
    <View style={styles.root}>
      {url && (
        <WebView
          ref={webviewRef}
          source={{ uri: url }}
          style={styles.webview}
          onLoadEnd={() => setLoading(false)}
        />
      )}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      )}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d="M15 18l-6-6 6-6" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
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
});
