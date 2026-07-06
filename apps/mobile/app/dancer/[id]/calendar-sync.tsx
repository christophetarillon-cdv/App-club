import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { functions } from '@/lib/firebase';
import { Colors } from '@/constants/Colors';

export default function CalendarSyncScreen() {
  const { id: dancerId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchLink = async () => {
    setLoading(true); setError(null);
    try {
      const res = await httpsCallable<{ dancerId: string }, { url: string }>(functions, 'getCalendarSyncLink')({ dancerId });
      setUrl(res.data.url);
    } catch {
      setError("Impossible de générer le lien. Vérifiez que vous avez le rôle nécessaire.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = () => {
    if (!url) return;
    const webcalUrl = url.replace(/^https?:\/\//, 'webcal://');
    Linking.openURL(webcalUrl).catch(() => Linking.openURL(url));
  };

  const handleCopy = async () => {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.root}>
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
          <Text style={styles.headerTitle}>Synchroniser mon planning</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.desc}>
          Abonnez votre agenda personnel (Calendrier iOS, Google Agenda…) au planning du club.
          Les séances se mettent à jour automatiquement, dans la limite du rafraîchissement de votre agenda.
        </Text>

        {!url ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={fetchLink} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Générer mon lien d'abonnement</Text>}
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSubscribe} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>S'abonner dans mon agenda</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleCopy} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>{copied ? 'Lien copié !' : 'Copier le lien'}</Text>
            </TouchableOpacity>
            <Text style={styles.urlText} numberOfLines={2}>{url}</Text>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 52, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600', flexShrink: 1 },

  content: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  desc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 8 },

  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  secondaryBtn: { backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  secondaryBtnText: { color: Colors.text, fontSize: 14, fontWeight: '500' },

  urlText: { fontSize: 12, color: Colors.textLight, marginTop: 4 },
  error: { fontSize: 13, color: '#DC2626', marginTop: 4 },
});
