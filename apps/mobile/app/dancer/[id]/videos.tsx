import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, Pressable, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import BottomTabBar from '@/components/BottomTabBar';
import VideoThumbnail from '@/components/VideoThumbnail';
import VideoPlayerSheet from '@/components/VideoPlayerSheet';
import VideoUploadSheet from '@/components/VideoUploadSheet';
import type { Media } from '@cdv/types';

interface Season { id: string; label: string; isActive: boolean; }
interface DanceStyle { id: string; name: string; color: string; }
interface CourseOpt { id: string; name: string; danceStyleId: string; levelId: string; }
interface LevelOpt { id: string; name: string; }

const FALLBACK_COLOR = '#4A8B9C';

function shortSeason(label: string): string {
  const m = label.match(/(\d{4})\D+(\d{4})/);
  return m ? `${m[1]!.slice(2)}-${m[2]!.slice(2)}` : label;
}
function fmtDuration(secs?: number): string | null {
  if (!secs) return null;
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VideoThumb({ video, color, seasonBadge, tag, onPress }: {
  video: Media; color: string; seasonBadge: string; tag?: string; onPress: () => void;
}) {
  const duration = fmtDuration(video.durationSeconds);
  return (
    <TouchableOpacity style={styles.thumbWrap} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.thumb}>
        <VideoThumbnail videoUrl={video.sourceUrl} fallbackColor={color} />
        <View style={styles.thumbScrim} />
        <View style={styles.seasonBadge}><Text style={styles.seasonBadgeText}>{seasonBadge}</Text></View>
        <View style={styles.playCircle}>
          <View style={[styles.playTriangle, { borderLeftColor: '#1A1A2E' }]} />
        </View>
        {duration && (
          <View style={styles.durationBadge}><Text style={styles.durationText}>{duration}</Text></View>
        )}
      </View>
      <Text style={styles.thumbTitle} numberOfLines={2}>{video.title}</Text>
      {tag && <Text style={styles.thumbTag} numberOfLines={1}>{tag}</Text>}
    </TouchableOpacity>
  );
}

export default function VideosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, account, dancers } = useAuth();
  const { selectedDancer } = useDancer();

  const [allMedia, setAllMedia] = useState<Media[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [styleList, setStyleList] = useState<DanceStyle[]>([]);
  const [courseList, setCourseList] = useState<CourseOpt[]>([]);
  const [levelList, setLevelList] = useState<LevelOpt[]>([]);
  const [paidSeasonIds, setPaidSeasonIds] = useState<string[]>([]);
  const [hasActiveTrial, setHasActiveTrial] = useState(false);
  const [loading, setLoading] = useState(true);

  const [selectedCourse, setSelectedCourse] = useState<string>('toutes');
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<Media | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const isAdminOrInstructor =
    !!account?.roles?.includes('admin') ||
    dancers.some(d => d.roles.includes('admin') || d.roles.includes('instructor'));
  // Même test que le menu Paramètres : basé sur le danseur SÉLECTIONNÉ uniquement.
  const isAdmin = (selectedDancer?.roles ?? []).includes('admin');

  const refreshMedia = () => {
    getDocs(query(collection(db, 'media'), orderBy('uploadedAt', 'desc')))
      .then(snap => setAllMedia(snap.docs.map(d => ({ id: d.id, ...d.data() } as Media))))
      .catch(() => {});
  };

  const handleDeleteVideo = (video: Media) => {
    Alert.alert(
      'Supprimer la vidéo',
      `Supprimer définitivement « ${video.title} » ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive', onPress: async () => {
            try {
              await httpsCallable(functions, 'deleteMedia')({ mediaId: video.id });
              setActiveVideo(null);
              setAllMedia(prev => prev.filter(m => m.id !== video.id));
            } catch (e: any) {
              Alert.alert('Erreur', e?.message ?? 'Suppression impossible.');
            }
          },
        },
      ],
    );
  };

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
      getDocs(query(collection(db, 'courses'), orderBy('name'))),
      getDocs(query(collection(db, 'levels'), orderBy('order'))),
    ]).then(([mediaSnap, seasonSnap, styleSnap, membershipSnap, courseSnap, levelSnap]) => {
      setAllMedia(mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as Media)));
      setSeasons(seasonSnap.docs.map(d => ({
        id: d.id, label: d.data().label ?? d.id, isActive: d.data().isActive === true,
      })));
      setStyleList(styleSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '', color: d.data().color ?? FALLBACK_COLOR })));
      const paid = membershipSnap.docs
        .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
        .map(d => d.data().seasonId as string).filter(Boolean);
      setPaidSeasonIds([...new Set(paid)]);
      setCourseList(courseSnap.docs.map(d => ({
        id: d.id, name: d.data().name ?? '', danceStyleId: d.data().danceStyleId ?? '', levelId: d.data().levelId ?? '',
      })));
      setLevelList(levelSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '' })));
    }).finally(() => setLoading(false));
  }, [user, dancers]);

  const activeSeason = seasons.find(s => s.isActive);

  const sortedSeasons = useMemo(() =>
    [...seasons].sort((a, b) => (a.isActive ? -1 : b.isActive ? 1 : (b.label > a.label ? 1 : -1))),
    [seasons]);

  const sortedCourses = useMemo(() =>
    [...courseList].sort((a, b) => a.name.localeCompare(b.name)),
    [courseList]);

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

  const seasonLabel = (value: string): string => {
    if (value === 'intemporel') return 'Intemporels';
    if (value === 'toutes') return 'Toutes les saisons';
    return seasons.find(s => s.id === value)?.label ?? 'Saison';
  };

  const courseFilterLabel = (value: string): string => {
    if (value === 'toutes') return 'Tous les cours';
    const c = courseList.find(x => x.id === value);
    if (!c) return 'Cours';
    const lvl = levelList.find(l => l.id === c.levelId)?.name;
    return lvl ? `${c.name} · ${lvl}` : c.name;
  };

  const visible = useMemo(() => allMedia.filter(m => {
    if (m.type !== 'video') return false;
    if (!canAccess(m)) return false;
    if (selectedCourse !== 'toutes' && m.courseId !== selectedCourse) return false;
    if (selectedSeason === 'intemporel' && m.seasonId) return false;
    if (selectedSeason !== 'intemporel' && selectedSeason !== 'toutes' && selectedSeason && m.seasonId !== selectedSeason) return false;
    return true;
  }), [allMedia, selectedCourse, selectedSeason, paidSeasonIds, hasActiveTrial, isAdminOrInstructor]);

  const sections = useMemo(() => {
    // Regroupement par cours (libellé « danse · niveau »).
    const byCourse = new Map<string, Media[]>();
    for (const m of visible) {
      const key = m.courseId ?? '__none__';
      if (!byCourse.has(key)) byCourse.set(key, []);
      byCourse.get(key)!.push(m);
    }
    const colorOfStyle = (styleId?: string | null) =>
      styleList.find(s => s.id === styleId)?.color ?? FALLBACK_COLOR;
    const result: { key: string; label: string; color: string; videos: Media[] }[] = [];
    for (const c of sortedCourses) {
      if (byCourse.has(c.id)) {
        result.push({ key: c.id, label: courseFilterLabel(c.id), color: colorOfStyle(c.danceStyleId), videos: byCourse.get(c.id)! });
      }
    }
    if (byCourse.has('__none__')) {
      result.push({ key: '__none__', label: 'Autres', color: FALLBACK_COLOR, videos: byCourse.get('__none__')! });
    }
    return result;
  }, [visible, styleList, sortedCourses, courseList, levelList]);

  const styleColorOf = (m: Media): string =>
    styleList.find(s => s.id === m.danceStyleId)?.color ?? FALLBACK_COLOR;

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
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerLeft} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.headerTitle}>Mes vidéos</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity style={styles.addBtn} onPress={() => setUploadOpen(true)} activeOpacity={0.85}>
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                <Path d="M12 5v14M5 12h14" stroke="#185FA5" strokeWidth={2.6} strokeLinecap="round" />
              </Svg>
              <Text style={styles.addBtnText}>Ajouter</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Sélecteur de cours (danse + niveau) */}
        <View style={styles.selectorWrap}>
          <TouchableOpacity style={styles.selector} onPress={() => setCoursePickerOpen(true)} activeOpacity={0.8}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke="#534AB7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={styles.selectorText}>{courseFilterLabel(selectedCourse)}</Text>
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

        {/* Picker cours (danse + niveau) */}
        <Modal visible={coursePickerOpen} transparent animationType="fade" onRequestClose={() => setCoursePickerOpen(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setCoursePickerOpen(false)}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Choisir un cours</Text>
              {[{ value: 'toutes', label: 'Tous les cours' },
                ...sortedCourses.map(c => ({ value: c.id, label: courseFilterLabel(c.id) }))
              ].map(opt => {
                const selected = opt.value === selectedCourse;
                return (
                  <TouchableOpacity key={opt.value} style={styles.modalOption}
                    onPress={() => { setSelectedCourse(opt.value); setCoursePickerOpen(false); }} activeOpacity={0.7}>
                    <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>{opt.label}</Text>
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
                    <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>{opt.label}</Text>
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
              : 'Aucune vidéo disponible.'}
          </Text>
        ) : (
          sections.map(({ key, label, color, videos }) => (
            <View key={key} style={styles.section}>
              <Text style={styles.sectionTitle}>{label}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionRow}>
                {videos.map(v => {
                  const levelId = v.levelId ?? courseList.find(c => c.id === v.courseId)?.levelId;
                  const styleObj = v.danceStyleId ? styleList.find(s => s.id === v.danceStyleId) : undefined;
                  const levelObj = levelId ? levelList.find(l => l.id === levelId) : undefined;
                  const tag = [styleObj?.name, levelObj?.name].filter(Boolean).join(' · ');
                  return (
                    <VideoThumb
                      key={v.id}
                      video={v}
                      color={color}
                      seasonBadge={seasonBadge(v.seasonId)}
                      tag={tag || undefined}
                      onPress={() => setActiveVideo(v)}
                    />
                  );
                })}
              </ScrollView>
            </View>
          ))
        )}
      </ScrollView>

      <BottomTabBar dancerId={id} qrValue={id} active="videos" bottomInset={insets.bottom} />

      {activeVideo && (
        <VideoPlayerSheet
          key={activeVideo.id}
          video={activeVideo}
          styleColor={styleColorOf(activeVideo)}
          seasonBadge={seasonBadge(activeVideo.seasonId)}
          onClose={() => setActiveVideo(null)}
          onDelete={isAdmin ? () => handleDeleteVideo(activeVideo) : undefined}
        />
      )}

      {uploadOpen && (
        <VideoUploadSheet
          seasons={sortedSeasons}
          danceStyles={styleList}
          defaultSeasonId={selectedSeason}
          onClose={() => setUploadOpen(false)}
          onUploaded={refreshMedia}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 50, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, paddingHorizontal: 12, height: 34 },
  addBtnText: { color: '#185FA5', fontSize: 13, fontWeight: '600' },

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
  modalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12 },
  modalOptionText: { fontSize: 16, color: Colors.text },
  modalOptionTextSelected: { color: '#2F86C0', fontWeight: '600' },

  section: { marginTop: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.text, paddingHorizontal: 16, marginBottom: 10 },
  sectionRow: { paddingHorizontal: 16, gap: 12 },

  thumbWrap: { width: 140 },
  thumb: { height: 86, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.12)' },
  seasonBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  seasonBadgeText: { fontSize: 9, fontWeight: '600', color: '#185FA5' },
  playCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  playTriangle: { width: 0, height: 0, borderLeftWidth: 12, borderTopWidth: 8, borderBottomWidth: 8, borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 3 },
  durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  durationText: { color: '#fff', fontSize: 10 },
  thumbTitle: { fontSize: 13, fontWeight: '500', color: Colors.text, marginTop: 6, lineHeight: 16 },
  thumbTag: { fontSize: 11, color: Colors.textLight, marginTop: 2 },

  empty: { textAlign: 'center', color: Colors.textSecondary, fontSize: 14, paddingVertical: 40, paddingHorizontal: 24 },
});
