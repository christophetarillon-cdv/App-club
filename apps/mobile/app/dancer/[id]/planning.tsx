import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import BottomTabBar from '@/components/BottomTabBar';
import type { Course, Session, DanceStyle, Level, Room } from '@cdv/types';

interface Slot {
  id?: string; // id du doc sessions — absent pour les créneaux virtuels générés côté client
  date: string;
  courseId: string;
  courseName: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'cancelled' | 'extra';
  cancellationReason?: string;
  style?: DanceStyle;
  level?: Level;
  room?: Room;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayLabel(): string {
  const s = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function weekRange(): string {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export default function PlanningScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingSlot, setOpeningSlot] = useState<string | null>(null);

  const handleSlotPress = async (slot: Slot) => {
    if (openingSlot) return;
    if (slot.id) {
      router.push({ pathname: '/dancer/[id]/session-detail', params: { id, sessionId: slot.id } });
      return;
    }
    // Créneau virtuel (pas encore de doc sessions pour cette date) — on le
    // crée à la volée via une Cloud Function (les danseurs n'ont pas le droit
    // d'écrire directement dans `sessions`).
    setOpeningSlot(slot.courseId);
    try {
      const res = await httpsCallable<{ courseId: string; date: string }, { sessionId: string }>(functions, 'ensureSessionForDate')({
        courseId: slot.courseId, date: slot.date,
      });
      router.push({ pathname: '/dancer/[id]/session-detail', params: { id, sessionId: res.data.sessionId } });
    } catch {
      // silencieux — l'utilisateur peut réessayer
    } finally {
      setOpeningSlot(null);
    }
  };

  useEffect(() => {
    const dateStr = todayIso();
    const todayDow = new Date().getDay();

    Promise.all([
      getDocs(query(collection(db, 'sessions'), where('date', '==', dateStr))),
      getDocs(collection(db, 'courses')),
      getDocs(collection(db, 'danceStyles')),
      getDocs(collection(db, 'levels')),
      getDocs(collection(db, 'rooms')),
    ]).then(([sessionsSnap, coursesSnap, stylesSnap, levelsSnap, roomsSnap]) => {
      const courses = new Map(coursesSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Course]));
      const styles = new Map(stylesSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as DanceStyle]));
      const levels = new Map(levelsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Level]));
      const rooms = new Map(roomsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Room]));

      const result: Slot[] = [];
      const handled = new Set<string>();

      for (const d of sessionsSnap.docs) {
        const s = { id: d.id, ...d.data() } as Session;
        handled.add(s.courseId);
        const course = courses.get(s.courseId);
        result.push({
          id: s.id,
          date: s.date,
          courseId: s.courseId,
          courseName: course?.name ?? '—',
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.status,
          cancellationReason: s.cancellationReason,
          style: course ? styles.get(course.danceStyleId) : undefined,
          level: course ? levels.get(course.levelId) : undefined,
          room: course ? rooms.get(course.roomId) : undefined,
        });
      }

      for (const [courseId, course] of courses) {
        if (handled.has(courseId)) continue;
        if (!course.isActive || course.dayOfWeek !== todayDow) continue;
        result.push({
          date: dateStr,
          courseId,
          courseName: course.name,
          startTime: course.startTime,
          endTime: course.endTime,
          status: 'scheduled',
          style: styles.get(course.danceStyleId),
          level: levels.get(course.levelId),
          room: rooms.get(course.roomId),
        });
      }

      result.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setSlots(result);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

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
          <Text style={styles.headerTitle}>Mon planning</Text>
        </TouchableOpacity>
        <Text style={styles.headerDate}>{todayLabel()}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
          ) : slots.length === 0 ? (
            <View style={styles.empty}>
              <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" style={{ marginBottom: 10 }}>
                <Path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  stroke={Colors.textLight} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={styles.emptyText}>{"Pas de cours aujourd'hui"}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>
                {`Aujourd'hui · ${slots.length} cours`}
              </Text>
              {slots.map(slot => (
                <SlotCard
                  key={slot.courseId}
                  slot={slot}
                  onPress={() => handleSlotPress(slot)}
                  opening={openingSlot === slot.courseId}
                />
              ))}
            </>
          )}

          <TouchableOpacity
            style={styles.weekBtn}
            onPress={() => router.push(`/dancer/${id}/week` as any)}
            activeOpacity={0.85}
          >
            <View>
              <Text style={styles.weekBtnTitle}>Voir la semaine</Text>
              <Text style={styles.weekBtnSub}>{weekRange()}</Text>
            </View>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M9 18l6-6-6-6" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BottomTabBar dancerId={id} active="planning" bottomInset={insets.bottom} />
    </View>
  );
}

function SlotCard({ slot, onPress, opening }: { slot: Slot; onPress: () => void; opening?: boolean }) {
  const cancelled = slot.status === 'cancelled';
  const iconColor = cancelled ? '#ccc' : '#888';

  return (
    <TouchableOpacity
      style={[styles.card, cancelled && styles.cardCancelled]}
      onPress={onPress}
      disabled={opening}
      activeOpacity={0.8}
    >
      <View style={styles.cardTimeline}>
        <Text style={[styles.timeStart, cancelled && styles.timeFaded]}>{slot.startTime}</Text>
        <View style={[styles.timeSep, cancelled && styles.timeSepFaded]} />
        <Text style={[styles.timeEnd, cancelled && styles.timeFaded]}>{slot.endTime}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.badges}>
          {slot.style && <StyleBadge name={slot.style.name} color={slot.style.color} faded={cancelled} />}
          {slot.level && <LevelBadge name={slot.level.name} faded={cancelled} />}
          {cancelled && (
            <View style={styles.badgeCancelled}>
              <Text style={styles.badgeCancelledText}>{"Annulé"}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.courseName, cancelled && styles.courseNameCancelled]}>{slot.courseName}</Text>
        {slot.room && (
          <View style={styles.infoRow}>
            <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
              <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"
                stroke={iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={12} cy={10} r={3} stroke={iconColor} strokeWidth={2} />
            </Svg>
            <Text style={[styles.infoText, cancelled && styles.infoTextFaded]}>{slot.room.name}</Text>
          </View>
        )}
      </View>
      {opening && <ActivityIndicator color={Colors.primary} size="small" style={{ marginLeft: 8 }} />}
    </TouchableOpacity>
  );
}

function StyleBadge({ name, color, faded }: { name: string; color: string; faded: boolean }) {
  if (faded) {
    return (
      <View style={[styles.badge, { backgroundColor: '#f0f0f0' }]}>
        <Text style={[styles.badgeText, { color: '#bbb' }]}>{name}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <Text style={[styles.badgeText, { color }]}>{name}</Text>
    </View>
  );
}

function LevelBadge({ name, faded }: { name: string; faded: boolean }) {
  return (
    <View style={[styles.badge, faded ? { backgroundColor: '#f0f0f0' } : styles.badgeLevelBg]}>
      <Text style={[styles.badgeText, faded ? { color: '#bbb' } : styles.badgeLevelText]}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 56, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  headerDate: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '400', textTransform: 'uppercase', letterSpacing: 0.5 },

  content: { paddingHorizontal: 20, paddingTop: 16 },

  sectionLabel: {
    fontSize: 12, fontWeight: '500', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.07)',
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCancelled: { opacity: 0.5 },

  cardTimeline: { alignItems: 'center', minWidth: 42 },
  timeStart: { fontSize: 14, fontWeight: '700', color: '#2F86C0' },
  timeSep: { width: 1.5, height: 18, backgroundColor: '#d0e8f5', marginVertical: 3 },
  timeSepFaded: { backgroundColor: '#eee' },
  timeEnd: { fontSize: 12, color: Colors.textLight },
  timeFaded: { color: '#ccc' },

  cardBody: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },

  badge: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '500' },
  badgeLevelBg: { backgroundColor: '#EAF3DE' },
  badgeLevelText: { color: '#3B6D11' },

  badgeCancelled: { backgroundColor: '#FCEBEB', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2 },
  badgeCancelledText: { fontSize: 11, fontWeight: '500', color: '#A32D2D' },

  courseName: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 7 },
  courseNameCancelled: { color: '#bbb', textDecorationLine: 'line-through' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoText: { fontSize: 12, color: Colors.textSecondary },
  infoTextFaded: { color: '#bbb' },

  empty: { alignItems: 'center', paddingTop: 48, paddingBottom: 24 },
  emptyText: { fontSize: 14, color: Colors.textLight },

  weekBtn: {
    marginTop: 20,
    backgroundColor: '#2F86C0',
    borderRadius: 14,
    padding: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekBtnTitle: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 2 },
  weekBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
});
