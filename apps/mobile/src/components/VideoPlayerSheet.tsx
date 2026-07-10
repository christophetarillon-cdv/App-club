import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions,
  PanResponder, BackHandler, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Slider from '@react-native-community/slider';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import type { Media } from '@cdv/types';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.round(SCREEN_H * 0.86);
const SPEED_PRESETS = [0.75, 1, 1.25, 1.5];

export default function VideoPlayerSheet({
  video, styleColor, seasonBadge, onClose, onDelete,
}: {
  video: Media;
  styleColor: string;
  seasonBadge: string;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SHEET_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  const [speed, setSpeed] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const player = useVideoPlayer(video.sourceUrl, p => { p.loop = false; p.play(); });

  // Animation d'entrée
  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
      Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  const close = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SHEET_H, duration: 220, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  // Bouton retour Android
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, []);

  // Glisser pour fermer (sur la poignée)
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
    onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 120) close();
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    },
  })).current;

  const changeSpeed = (v: number) => {
    const r = Math.max(0.25, Math.min(2, Math.round(v * 100) / 100));
    setSpeed(r);
    player.playbackRate = r;
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      const safe = video.title.replace(/[^a-zA-Z0-9._-]/g, '_');
      const dest = `${FileSystem.cacheDirectory}${safe || 'video'}.mp4`;
      // Téléchargement resumable : reprend au lieu d'échouer si l'app passe en
      // arrière-plan ou si le téléphone se met en veille pendant le transfert.
      const dl = FileSystem.createDownloadResumable(
        video.sourceUrl, dest, {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) setDownloadProgress(totalBytesWritten / totalBytesExpectedToWrite);
        },
      );
      const result = await dl.downloadAsync();
      const uri = result?.uri;
      if (!uri) throw new Error('Téléchargement échoué');
      if (perm.granted) {
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Enregistrée', 'La vidéo a été ajoutée à ta galerie.');
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'video/mp4' });
      } else {
        Alert.alert('Permission requise', "Autorise l'accès aux photos pour enregistrer la vidéo.");
      }
    } catch {
      Alert.alert('Erreur', 'Téléchargement impossible.');
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { height: SHEET_H, paddingBottom: insets.bottom + 16, transform: [{ translateY }] }]}>
        <View {...pan.panHandlers} style={styles.handleZone}>
          <View style={styles.handle} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.videoWrap}>
            <VideoView style={styles.video} player={player} nativeControls allowsFullscreen contentFit="contain" />
          </View>

          <View style={styles.meta}>
            <Text style={styles.title}>{video.title}</Text>
            <View style={styles.chips}>
              <View style={[styles.chip, { backgroundColor: styleColor + '22' }]}>
                <Text style={[styles.chipText, { color: styleColor }]}>{seasonBadge}</Text>
              </View>
            </View>
            {video.description ? <Text style={styles.desc}>{video.description}</Text> : null}
          </View>

          {/* Vitesse de lecture */}
          <View style={styles.speedCard}>
            <View style={styles.speedHeader}>
              <Text style={styles.speedLabel}>Vitesse de lecture</Text>
              <TouchableOpacity onPress={() => changeSpeed(1)}>
                <Text style={styles.speedValue}>{Math.round(speed * 100)}%</Text>
              </TouchableOpacity>
            </View>
            <Slider
              style={{ height: 36 }}
              minimumValue={0.25}
              maximumValue={2}
              step={0.01}
              value={speed}
              onValueChange={changeSpeed}
              minimumTrackTintColor="#2F86C0"
              maximumTrackTintColor="#E5E7EB"
              thumbTintColor="#2F86C0"
            />
            <View style={styles.speedMarks}>
              <Text style={styles.speedMark}>25%</Text>
              <Text style={styles.speedMark}>100%</Text>
              <Text style={styles.speedMark}>200%</Text>
            </View>
            <View style={styles.presets}>
              {SPEED_PRESETS.map(p => {
                const active = Math.abs(speed - p) < 0.005;
                return (
                  <TouchableOpacity key={p} style={[styles.preset, active && styles.presetActive]} onPress={() => changeSpeed(p)}>
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>{Math.round(p * 100)}%</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity style={styles.downloadBtn} onPress={handleDownload} disabled={downloading} activeOpacity={0.85}>
            <Text style={styles.downloadText}>
              {downloading ? `Téléchargement… ${Math.round(downloadProgress * 100)}%` : 'Télécharger la vidéo'}
            </Text>
          </TouchableOpacity>

          {onDelete && (
            <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} disabled={downloading} activeOpacity={0.85}>
              <Text style={styles.deleteText}>Supprimer la vidéo</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16,
  },
  handleZone: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D3D1C7' },

  videoWrap: { height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1A1A2E' },
  video: { width: '100%', height: '100%' },

  meta: { paddingTop: 14 },
  title: { fontSize: 18, fontWeight: '600', color: Colors.text },
  chips: { flexDirection: 'row', gap: 7, marginTop: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  chipText: { fontSize: 11, fontWeight: '500' },
  desc: { fontSize: 14, color: Colors.textSecondary, marginTop: 10, lineHeight: 20 },

  speedCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', borderRadius: 16, padding: 14, marginTop: 16 },
  speedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speedLabel: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  speedValue: { fontSize: 18, fontWeight: '700', color: '#2F86C0' },
  speedMarks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  speedMark: { fontSize: 10, color: Colors.textLight },
  presets: { flexDirection: 'row', gap: 7, marginTop: 12 },
  preset: { flex: 1, alignItems: 'center', paddingVertical: 6, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10 },
  presetActive: { backgroundColor: '#2F86C0', borderColor: '#2F86C0' },
  presetText: { fontSize: 12, color: Colors.textSecondary },
  presetTextActive: { color: '#fff', fontWeight: '500' },

  downloadBtn: { backgroundColor: Colors.orange, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  downloadText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  deleteBtn: { borderWidth: 1, borderColor: '#E5484D', borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  deleteText: { color: '#E5484D', fontSize: 15, fontWeight: '600' },
});
