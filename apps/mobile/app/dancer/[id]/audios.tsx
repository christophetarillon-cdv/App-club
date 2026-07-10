import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import BottomTabBar from '@/components/BottomTabBar';
import AudioPlayerSheet from '@/components/AudioPlayerSheet';
import type { Media } from '@cdv/types';

interface Season { id: string; label: string; isActive: boolean; }
interface DanceStyle { id: string; name: string; color: string; }

const FALLBACK_COLOR = '#7F77DD';

function shortSeason(label: string): string {
  const m = label.match(/(\d{4})\D+(\d{4})/);
  return m ? `${m[1]!.slice(2)}-${m[2]!.slice(2)}` : label;
}
function fmtDuration(secs?: number): string | null {
  if (!secs) return null;
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function AudioThumb({ audio, color, seasonBadge, onPress }: {
  audio: Media; color: string; seasonBadge: string; onPress: () => void;
}) {
  const duration = fmtDuration(audio.durationSeconds);
  return (
    <TouchableOpacity style={styles.thumbWrap} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.thumb, { backgroundColor: color }]}>
        <View style={styles.seasonBadge}><Text style={styles.seasonBadgeText}>{seasonBadge}</Text></View>
        <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
          <Path d="M9 18V5l12-2v13" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M6 21a3 3 0 100-6 3 3 0 000 6zM18 19a3 3 0 100-6 3 3 0 000 6z" stroke="#fff" strokeWidth={1.6} />
        </Svg>
        {duration && (
          <View style={styles.durationBadge}><Text style={styles.durationText}>{duration}</Text></View>
        )}
      </View>
      <Text style={styles.thumbTitle} numberOfLines={2}>{audio.title}</Text>
    </TouchableOpacity>
  );
}

export default function AudiosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, account, dancers } = useAuth();

  const [allMedia, setAllMedia] = useState<Media[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [styleList, setStyleList] = useState<DanceStyle[]>([]);
  const [paidSeasonIds, setPaidSeasonIds] = useState<string[]>([]);
  const [hasActiveTrial, setHasActiveTrial] = useState(false);
  const [loading, setLoading] = useState(true);

  const [selectedStyle, setSelectedStyle] = useState<string>('toutes');
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const [queue, setQueue] = useState<{ list: Media[]; index: number; color: string } | null>(null);

  const isAdminOrInstructor =
    !!account?.roles?.includes('admin') ||
    dancers.some(d => d.roles.includes('admin') || d.roles.includes('instructor'));

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    setHasActiveTrial(dancers.some(d =>
      d.roles.includes('trial') && d.trialExpiresAt && (d.trialExpiresAt as any).toDate?.() > now
    ));

    Promise.all([
      getDocs(query(collection(db, 'media'), orderBy('uploadedAt', 'desc'))),
      getDocs(collection(db, 'seasons')),
      getDocs(collection(db, 'danceStyles')),
      getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
    ]).then(([mediaSnap, seasonSnap, styleSnap, membershipSnap]) => {
      setAllMedia(mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as Media)));
      setSeasons(seasonSnap.docs.map(d => ({
        id: d.id, label: d.data().label ?? d.id, isActive: d.data().isActive === true,
      })));
      setStyleList(styleSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '', color: d.data().color ?? FALLBACK_COLOR })));
      const paid = membershipSnap.docs
        .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
        .map(d => d.data().seasonId as string).filter(Boolean);
      setPaidSeasonIds([...new Set(paid)]);
    }).finally(() => setLoading(false));
  }, [user, dancers]);

  const activeSeason = seasons.find(s => s.isActive);

  const sortedSeasons = useMemo(() =>
    [...seasons].sort((a, b) => (a.isActive ? -1 : b.isActive ? 1 : (b.label > a.label ? 1 : -1))),
    [seasons]);

  const sortedStyles = useMemo(() =>
    [...styleList].sort((a, b) => a.name.localeCompare(b.name)),
    [styleList]);

  useEffect(() => {
    if (selectedSeason || seasons.length === 0) return;
    setSelectedSeason(activeSeason?.id ?? sortedSeasons[0]?.id ?? 'intemporel');
  }, [seasons, activeSeason?.id]);

  const canAccess = (m: Media): boolean => {
    if (isAdminOrInstructor || hasActiveTrial) return true;
    if (!m.seasonId) return paidSeasonIds.length > 0;
    return paidSeasonIds.includes(m.seasonId);
  };

  const seasonBadge = (seasonId?: string | null): string =>
    seasonId ? shortSeason(seasons.find(s => s.id === seasonId)?.label ?? seasonId) : 'Intemporel';
  const seasonBadgeOf = (m: Media) => seasonBadge(m.seasonId);

  const seasonLabel = (value: string): string => {
    if (value === 'intemporel') return 'Intemporels';
    if (value === 'toutes') return 'Toutes les saisons';
    return seasons.find(s => s.id === value)?.label ?? 'Saison';
  };

  const styleLabel = (value: string): string => {
    if (value === 'toutes') return 'Toutes les danses';
    return styleList.find(s => s.id === value)?.name ?? 'Danse';
  };

  const visible = useMemo(() => allMedia.filter(m => {
    if (m.type !== 'audio') return false;
    if (!canAccess(m)) return false;
    if (selectedStyle !== 'toutes' && m.danceStyleId !== selectedStyle) return false;
    if (selectedSeason === 'intemporel' && m.seasonId) return false;
    if (selectedSeason !== 'intemporel' && selectedSeason !== 'toutes' && selectedSeason && m.seasonId !== selectedSeason) return false;
    return true;
  }), [allMedia, selectedStyle, selectedSeason, paidSeasonIds, hasActiveTrial, isAdminOrInstructor]);

  const sections = useMemo(() => {
    const byStyle = new Map<string, Media[]>();
    for (const m of visible) {
      const key = m.danceStyleId ?? '__none__';
      if (!byStyle.has(key)) byStyle.set(key, []);
      byStyle.get(key)!.push(m);
    }
    const ordered = [...styleList]
      .filter(s => byStyle.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(s => ({ style: s, audios: byStyle.get(s.id)! }));
    if (byStyle.has('__none__')) {
      ordered.push({ style: { id: '__none__', name: 'Autres', color: FALLBACK_COLOR }, audios: byStyle.get('__none__')! });
    }
    return ordered;
  }, [visible, styleList]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <LinearGradient
          colors={['#2F86C0', '#2F86C0', '#7FBFE3', '#D8EAF3', Colors.background]}
          locations={[0, 0.32, 0.58, 0.8, 0.97]}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerWave} pointerEvents="none">
          <Svg width="100%" height="100%" viewBox="0 0 400 44" preserveAspectRatio="none">
            <Path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" fill={Colors.background} />
          </Svg>
        </View>
        <TouchableOpacity style={styles.headerRow} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.headerTitle}>Mes audios</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Sélecteur de danse */}
        <View style={styles.selectorWrap}>
          <TouchableOpacity style={styles.selector} onPress={() => setStylePickerOpen(true)} activeOpacity={0.8}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke="#534AB7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={styles.selectorText}>{styleLabel(selectedStyle)}</Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M6 9l6 6 6-6" stroke={Colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        {/* Sélecteur de saison */}
        <View style={[styles.selectorWrap, { marginTop: 8 }]}>
          <TouchableOpacity style={styles.selector} onPress={() => setSeasonPickerOpen(true)} activeOpacity={0.8}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="#2F86C0" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={styles.selectorText}>{seasonLabel(selectedSeason)}</Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M6 9l6 6 6-6" stroke={Colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        {/* Picker danse */}
        <Modal visible={stylePickerOpen} transparent animationType="fade" onRequestClose={() => setStylePickerOpen(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setStylePickerOpen(false)}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Choisir une danse</Text>
              {[{ value: 'toutes', label: 'Toutes les danses' },
                ...sortedStyles.map(s => ({ value: s.id, label: s.name }))
              ].map(opt => {
                const selected = opt.value === selectedStyle;
                return (
                  <TouchableOpacity key={opt.value} style={styles.modalOption}
                    onPress={() => { setSelectedStyle(opt.value); setStylePickerOpen(false); }} activeOpacity={0.7}>
                    <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelectedStyle]} numberOfLines={2}>{opt.label}</Text>
                    {selected && (
                      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                        <Path d="M5 13l4 4L19 7" stroke="#534AB7" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Modal>

        {/* Picker saison */}
        <Modal visible={seasonPickerOpen} transparent animationType="fade" onRequestClose={() => setSeasonPickerOpen(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setSeasonPickerOpen(false)}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Choisir une saison</Text>
              {[...sortedSeasons.map(s => ({ value: s.id, label: s.label + (s.isActive ? '  • en cours' : '') })),
                { value: 'intemporel', label: 'Intemporels' },
                { value: 'toutes', label: 'Toutes les saisons' }].map(opt => {
                const selected = opt.value === selectedSeason;
                return (
                  <TouchableOpacity key={opt.value} style={styles.modalOption}
                    onPress={() => { setSelectedSeason(opt.value); setSeasonPickerOpen(false); }} activeOpacity={0.7}>
                    <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]} numberOfLines={2}>{opt.label}</Text>
                    {selected && (
                      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                        <Path d="M5 13l4 4L19 7" stroke="#2F86C0" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Modal>

        {/* Sections par style */}
        {loading ? (
          <Text style={styles.empty}>Chargement…</Text>
        ) : sections.length === 0 ? (
          <Text style={styles.empty}>
            {paidSeasonIds.length === 0 && !isAdminOrInstructor && !hasActiveTrial
              ? "L'accès à la médiathèque requiert une cotisation active."
              : 'Aucun audio disponible.'}
          </Text>
        ) : (
          sections.map(({ style, audios }) => (
            <View key={style.id} style={styles.section}>
              <Text style={styles.sectionTitle}>{style.name}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionRow}>
                {audios.map((a, i) => (
                  <AudioThumb
                    key={a.id}
                    audio={a}
                    color={style.color}
                    seasonBadge={seasonBadge(a.seasonId)}
                    onPress={() => setQueue({ list: audios, index: i, color: style.color })}
                  />
                ))}
              </ScrollView>
            </View>
          ))
        )}
      </ScrollView>

      <BottomTabBar dancerId={id} qrValue={id} active="audios" bottomInset={insets.bottom} />

      {queue && (
        <AudioPlayerSheet
          queue={queue.list}
          startIndex={queue.index}
          styleColor={queue.color}
          seasonBadgeOf={seasonBadgeOf}
          onClose={() => setQueue(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 50, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },

  selectorWrap: { paddingHorizontal: 16, marginTop: 8 },
  selector: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 12, paddingHorizontal: 12, height: 44,
  },
  selectorText: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.text },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 18, paddingBottom: 34, paddingHorizontal: 8 },
  modalTitle: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 14, marginBottom: 6 },
  modalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12 },
  modalOptionText: { fontSize: 16, color: Colors.text, flex: 1, flexShrink: 1 },
  modalOptionTextSelected: { color: '#2F86C0', fontWeight: '600' },
  modalOptionTextSelectedStyle: { color: '#534AB7', fontWeight: '600' },

  section: { marginTop: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.text, paddingHorizontal: 16, marginBottom: 10 },
  sectionRow: { paddingHorizontal: 16, gap: 12 },

  thumbWrap: { width: 140 },
  thumb: { height: 86, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  seasonBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  seasonBadgeText: { fontSize: 9, fontWeight: '600', color: '#185FA5' },
  durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  durationText: { color: '#fff', fontSize: 10 },
  thumbTitle: { fontSize: 13, fontWeight: '500', color: Colors.text, marginTop: 6, lineHeight: 16 },

  empty: { textAlign: 'center', color: Colors.textSecondary, fontSize: 14, paddingVertical: 40, paddingHorizontal: 24 },
});
