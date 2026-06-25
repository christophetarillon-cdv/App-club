import { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, Alert, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/Colors';
import type { Dancer } from '@cdv/types';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_H = Math.round(SCREEN_H * 0.82);

export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dancers } = useAuth();

  const startIndex = Math.max(0, dancers.findIndex(d => d.id === id));
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [downloading, setDownloading] = useState(false);
  const qrRefs = useRef<Record<string, any>>({});

  const dancer = dancers[currentIndex];

  const handleDownload = () => {
    const ref = dancer ? qrRefs.current[dancer.id] : null;
    if (!dancer || !ref) return;
    setDownloading(true);
    ref.toDataURL(async (base64: string) => {
      try {
        const uri = `${FileSystem.cacheDirectory}qr-${dancer.firstName}-${dancer.lastName}.png`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Mon QR code' });
        } else {
          Alert.alert('Indisponible', "Le partage n'est pas disponible sur cet appareil.");
        }
      } catch {
        Alert.alert('Erreur', "Impossible de générer l'image du QR code.");
      } finally {
        setDownloading(false);
      }
    });
  };

  const renderItem = ({ item }: { item: Dancer }) => (
    <View style={styles.page}>
      <View style={styles.qrWrap}>
        <QRCode
          value={item.id}
          size={200}
          color="white"
          backgroundColor={Colors.orange}
          getRef={(c: any) => { qrRefs.current[item.id] = c; }}
        />
      </View>
      <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
      {item.memberNumber
        ? <Text style={styles.memberNumber}>{item.memberNumber}</Text>
        : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => router.back()} />

      <View style={[styles.sheet, { height: SHEET_H, paddingBottom: insets.bottom + 16 }]}>
        {/* Handle */}
        <View style={styles.handleZone}>
          <View style={styles.handle} />
        </View>

        {/* Carrousel horizontal */}
        <FlatList
          data={dancers}
          keyExtractor={d => d.id}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startIndex}
          getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
          onMomentumScrollEnd={e => {
            setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W));
          }}
          style={{ flexGrow: 0 }}
        />

        {/* Dots */}
        {dancers.length > 1 && (
          <View style={styles.dotsRow}>
            {dancers.map((_, i) => (
              <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
            ))}
          </View>
        )}

        {/* Bouton télécharger */}
        <TouchableOpacity
          style={[styles.downloadBtn, downloading && { opacity: 0.6 }]}
          onPress={handleDownload}
          disabled={downloading}
          activeOpacity={0.85}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
              stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={styles.downloadText}>{downloading ? 'Préparation…' : 'Télécharger le QR code'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleZone: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D3D1C7' },

  page: {
    width: SCREEN_W,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  qrWrap: {
    backgroundColor: Colors.orange,
    borderRadius: 22,
    padding: 18,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  name: { fontSize: 22, fontWeight: '600', color: Colors.text, marginTop: 20, textAlign: 'center' },
  memberNumber: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Courier', marginTop: 6 },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9D6DC' },
  dotActive: { backgroundColor: Colors.orange, width: 22, borderRadius: 4 },

  downloadBtn: {
    marginHorizontal: 20,
    backgroundColor: Colors.orange,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  downloadText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
