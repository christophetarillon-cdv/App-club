import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions,
  PanResponder, BackHandler, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';
import Svg, { Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import type { Media } from '@cdv/types';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.round(SCREEN_H * 0.9);
const SPEED_PRESETS = [0.75, 1, 1.25, 1.5];

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function AudioPlayerSheet({
  queue, startIndex, styleColor, seasonBadgeOf, onClose,
}: {
  queue: Media[];
  startIndex: number;
  styleColor: string;
  seasonBadgeOf: (m: Media) => string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SHEET_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  const soundRef = useRef<Audio.Sound | null>(null);
  const [index, setIndex] = useState(startIndex);
  const indexRef = useRef(startIndex);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingTrack, setLoadingTrack] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const seekingRef = useRef(false);

  const current = queue[index];
  const next = queue[(index + 1) % queue.length];

  const onStatus = (st: any) => {
    if (!st.isLoaded) return;
    if (!seekingRef.current) setPosition(st.positionMillis ?? 0);
    setDuration(st.durationMillis ?? 0);
    setIsPlaying(st.isPlaying ?? false);
    if (st.didJustFinish) goTo((indexRef.current + 1) % queue.length); // boucle
  };

  const loadTrack = async (i: number) => {
    setLoadingTrack(true);
    if (soundRef.current) { try { await soundRef.current.unloadAsync(); } catch {} soundRef.current = null; }
    const track = queue[i];
    if (!track) return;
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.sourceUrl },
        { shouldPlay: true, rate: speedRef.current, shouldCorrectPitch: true },
        onStatus,
      );
      soundRef.current = sound;
    } catch {
      Alert.alert('Erreur', 'Lecture impossible.');
    } finally {
      setLoadingTrack(false);
    }
  };

  const goTo = (i: number) => { indexRef.current = i; setIndex(i); setPosition(0); loadTrack(i); };

  // Init audio + 1er morceau
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false }).catch(() => {});
    loadTrack(startIndex);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
      Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    return () => { if (soundRef.current) soundRef.current.unloadAsync().catch(() => {}); };
  }, []);

  const close = () => {
    if (soundRef.current) soundRef.current.unloadAsync().catch(() => {});
    Animated.parallel([
      Animated.timing(translateY, { toValue: SHEET_H, duration: 220, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, []);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
    onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 120) close();
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    },
  })).current;

  const togglePlay = async () => {
    const s = soundRef.current; if (!s) return;
    if (isPlaying) await s.pauseAsync(); else await s.playAsync();
  };
  const prev = () => {
    if (position > 3000) { soundRef.current?.setPositionAsync(0); return; }
    goTo((index - 1 + queue.length) % queue.length);
  };
  const nextTrack = () => goTo((index + 1) % queue.length);

  const changeSpeed = (v: number) => {
    const r = Math.max(0.25, Math.min(2, Math.round(v * 100) / 100));
    setSpeed(r); speedRef.current = r;
    soundRef.current?.setRateAsync(r, true).catch(() => {});
  };

  const handleDownload = async () => {
    if (!current) return;
    setDownloading(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      const safe = current.title.replace(/[^a-zA-Z0-9._-]/g, '_');
      const dest = `${FileSystem.cacheDirectory}${safe || 'audio'}.mp3`;
      const { uri } = await FileSystem.downloadAsync(current.sourceUrl, dest);
      if (perm.granted) { await MediaLibrary.saveToLibraryAsync(uri); Alert.alert('Enregistré', "L'audio a été ajouté à ta galerie."); }
      else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'audio/mpeg' });
      else Alert.alert('Permission requise', "Autorise l'accès aux photos pour enregistrer.");
    } catch { Alert.alert('Erreur', 'Téléchargement impossible.'); }
    finally { setDownloading(false); }
  };

  if (!current) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { height: SHEET_H, paddingBottom: insets.bottom + 16, transform: [{ translateY }] }]}>
        <View {...pan.panHandlers} style={styles.handleZone}><View style={styles.handle} /></View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
          {/* Pochette */}
          <View style={[styles.art, { backgroundColor: styleColor }]}>
            <Svg width={72} height={72} viewBox="0 0 24 24" fill="none">
              <Path d="M9 18V5l12-2v13" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M6 21a3 3 0 100-6 3 3 0 000 6zM18 19a3 3 0 100-6 3 3 0 000 6z" stroke="#fff" strokeWidth={1.6} />
            </Svg>
          </View>

          <Text style={styles.title} numberOfLines={2}>{current.title}</Text>
          <View style={styles.chip}><Text style={[styles.chipText, { color: styleColor }]}>{seasonBadgeOf(current)}</Text></View>

          {/* Barre de progression */}
          <View style={styles.seekRow}>
            <Slider
              style={{ width: '100%', height: 36 }}
              minimumValue={0}
              maximumValue={duration || 1}
              value={position}
              onSlidingStart={() => { seekingRef.current = true; }}
              onSlidingComplete={v => { seekingRef.current = false; soundRef.current?.setPositionAsync(v); }}
              minimumTrackTintColor={styleColor}
              maximumTrackTintColor="#E5E7EB"
              thumbTintColor={styleColor}
            />
            <View style={styles.times}><Text style={styles.time}>{fmt(position)}</Text><Text style={styles.time}>{fmt(duration)}</Text></View>
          </View>

          {/* Transport */}
          <View style={styles.transport}>
            <TouchableOpacity onPress={prev} hitSlop={10}>
              <Svg width={32} height={32} viewBox="0 0 24 24" fill="none"><Path d="M19 20L9 12l10-8v16zM5 19V5" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </TouchableOpacity>
            <TouchableOpacity onPress={togglePlay} style={[styles.playBtn, { backgroundColor: styleColor }]} activeOpacity={0.85}>
              {loadingTrack ? <ActivityIndicator color="#fff" /> : isPlaying ? (
                <Svg width={28} height={28} viewBox="0 0 24 24" fill="none"><Path d="M8 5v14M16 5v14" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" /></Svg>
              ) : (
                <View style={styles.playTriangle} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={nextTrack} hitSlop={10}>
              <Svg width={32} height={32} viewBox="0 0 24 24" fill="none"><Path d="M5 4l10 8-10 8V4zM19 5v14" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </TouchableOpacity>
          </View>

          {queue.length > 1 && (
            <Text style={styles.upNext} numberOfLines={1}>À suivre : {next?.title}</Text>
          )}

          {/* Vitesse */}
          <View style={styles.speedCard}>
            <View style={styles.speedHeader}>
              <Text style={styles.speedLabel}>Vitesse de lecture</Text>
              <TouchableOpacity onPress={() => changeSpeed(1)}><Text style={[styles.speedValue, { color: styleColor }]}>{Math.round(speed * 100)}%</Text></TouchableOpacity>
            </View>
            <Slider style={{ height: 36 }} minimumValue={0.25} maximumValue={2} step={0.01} value={speed}
              onValueChange={changeSpeed} minimumTrackTintColor={styleColor} maximumTrackTintColor="#E5E7EB" thumbTintColor={styleColor} />
            <View style={styles.speedMarks}><Text style={styles.speedMark}>25%</Text><Text style={styles.speedMark}>100%</Text><Text style={styles.speedMark}>200%</Text></View>
            <View style={styles.presets}>
              {SPEED_PRESETS.map(p => {
                const active = Math.abs(speed - p) < 0.005;
                return (
                  <TouchableOpacity key={p} style={[styles.preset, active && { backgroundColor: styleColor, borderColor: styleColor }]} onPress={() => changeSpeed(p)}>
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>{Math.round(p * 100)}%</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity style={styles.downloadBtn} onPress={handleDownload} disabled={downloading} activeOpacity={0.85}>
            {downloading ? <ActivityIndicator color="#fff" /> : <Text style={styles.downloadText}>Télécharger l'audio</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20 },
  handleZone: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D3D1C7' },

  art: { width: 200, height: 200, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  title: { fontSize: 20, fontWeight: '600', color: Colors.text, textAlign: 'center', marginTop: 18 },
  chip: { marginTop: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  chipText: { fontSize: 12, fontWeight: '600' },

  seekRow: { width: '100%', marginTop: 18 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  time: { fontSize: 11, color: Colors.textLight },

  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, marginTop: 8 },
  playBtn: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  playTriangle: { width: 0, height: 0, borderLeftWidth: 22, borderTopWidth: 14, borderBottomWidth: 14, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 5 },
  upNext: { fontSize: 12, color: Colors.textSecondary, marginTop: 16, maxWidth: '90%' },

  speedCard: { width: '100%', backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', borderRadius: 16, padding: 14, marginTop: 18 },
  speedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speedLabel: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  speedValue: { fontSize: 18, fontWeight: '700' },
  speedMarks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  speedMark: { fontSize: 10, color: Colors.textLight },
  presets: { flexDirection: 'row', gap: 7, marginTop: 12 },
  preset: { flex: 1, alignItems: 'center', paddingVertical: 6, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10 },
  presetText: { fontSize: 12, color: Colors.textSecondary },
  presetTextActive: { color: '#fff', fontWeight: '500' },

  downloadBtn: { width: '100%', backgroundColor: Colors.orange, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  downloadText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
