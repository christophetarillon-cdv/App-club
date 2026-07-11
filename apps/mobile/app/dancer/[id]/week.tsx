import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, FlatList, ScrollView, StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import type { Course, Session, DanceStyle, Level, Room } from '@cdv/types';

const { width: SCREEN_W } = Dimensions.get('window');
const WEEK_COUNT = 9;
const CENTER_INDEX = 4;

const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMondayOf(d: Date): Date {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function weekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) => `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  return `${fmt(monday)} – ${fmt(sunday)} ${sunday.getFullYear()}`;
}

interface Slot {
  id?: string; // id du doc sessions — absent pour les créneaux virtuels générés côté client
  date: string;
  courseId: string;
  courseName: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'cancelled' | 'extra';
  style?: DanceStyle;
  level?: Level;
  room?: Room;
}

export default function WeekScreen() {
  const { id: dancerId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList>(null);

  const weeks = useMemo(() => {
    const base = getMondayOf(new Date());
    return Array.from({ length: WEEK_COUNT }, (_, i) => addDays(base, (i - CENTER_INDEX) * 7));
  }, []);

  const [currentIndex, setCurrentIndex] = useState(CENTER_INDEX);
  const [slotsByDate, setSlotsByDate] = useState<Map<string, Slot[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [openingSlot, setOpeningSlot] = useState<string | null>(null);

  const handleSlotPress = async (slot: Slot) => {
    if (openingSlot) return;
    if (slot.id) {
      router.push({ pathname: '/dancer/[id]/session-detail', params: { id: dancerId, sessionId: slot.id } });
      return;
    }
    // Créneau virtuel (pas encore de doc sessions pour cette date) — on le
    // crée à la volée via Cloud Function (écriture directe interdite aux danseurs).
    setOpeningSlot(slot.courseId + slot.date);
    try {
      const res = await httpsCallable<{ courseId: string; date: string }, { sessionId: string }>(functions, 'ensureSessionForDate')({
        courseId: slot.courseId, date: slot.date,
      });
      router.push({ pathname: '/dancer/[id]/session-detail', params: { id: dancerId, sessionId: res.data.sessionId } });
    } catch {
      // silencieux — l'utilisateur peut réessayer
    } finally {
      setOpeningSlot(null);
    }
  };

  const todayStr = useMemo(() => toDateStr(new Date()), []);

  useEffect(() => {
    const rangeStart = toDateStr(weeks[0]);
    const rangeEnd = toDateStr(addDays(weeks[WEEK_COUNT - 1], 6));

    Promise.all([
      getDocs(query(
        collection(db, 'sessions'),
        where('date', '>=', rangeStart),
        where('date', '<=', rangeEnd),
        orderBy('date'),
        orderBy('startTime'),
      )),
      getDocs(collection(db, 'courses')),
      getDocs(collection(db, 'danceStyles')),
      getDocs(collection(db, 'rooms')),
      getDocs(collection(db, 'levels')),
    ]).then(([sessionsSnap, coursesSnap, stylesSnap, roomsSnap, levelsSnap]) => {
      const courses = new Map(coursesSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Course]));
      const styles = new Map(stylesSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as DanceStyle]));
      const rooms = new Map(roomsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Room]));
      const levels = new Map(levelsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Level]));

      const map = new Map<string, Slot[]>();

      for (const d of sessionsSnap.docs) {
        const s = { id: d.id, ...d.data() } as Session;
        const course = courses.get(s.courseId);
        const existing = map.get(s.date) ?? [];
        existing.push({
          id: s.id,
          date: s.date,
          courseId: s.courseId,
          courseName: course?.name ?? '—',
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.status,
          style: course ? styles.get(course.danceStyleId) : undefined,
          level: course ? levels.get(course.levelId) : undefined,
          room: (s.roomId || course?.roomId) ? rooms.get(s.roomId || course!.roomId) : undefined,
        });
        map.set(s.date, existing);
      }

      for (let i = 0; i < WEEK_COUNT * 7; i++) {
        const date = addDays(weeks[0], i);
        const dateStr = toDateStr(date);
        const dow = date.getDay();
        for (const [courseId, course] of courses) {
          if (!course.isActive || course.dayOfWeek !== dow) continue;
          const existing = map.get(dateStr) ?? [];
          if (existing.some(s => s.courseId === courseId)) continue;
          existing.push({
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
          map.set(dateStr, existing);
        }
      }

      for (const [date, slots] of map) {
        map.set(date, slots.sort((a, b) => a.startTime.localeCompare(b.startTime)));
      }

      setSlotsByDate(map);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [weeks]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 50 }), []);

  const renderWeek = useCallback(({ item: monday }: { item: Date }) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    return (
      <ScrollView
        style={{ width: SCREEN_W }}
        contentContainerStyle={styles.weekContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {days.map(day => {
          const dateStr = toDateStr(day);
          const isToday = dateStr === todayStr;
          const daySlots = slotsByDate.get(dateStr) ?? [];
          return (
            <View
              key={dateStr}
              style={[
                styles.dayRow,
                isToday && styles.dayRowToday,
              ]}
            >
              <View style={styles.dayLabel}>
                <Text style={[styles.dayName, isToday && styles.dayNameToday]}>
                  {DAY_SHORT[day.getDay()]}
                </Text>
                <View style={[styles.dayNumWrap, isToday && styles.dayNumToday]}>
                  <Text style={[styles.dayNumText, isToday && styles.dayNumTextToday]}>
                    {day.getDate()}
                  </Text>
                </View>
              </View>
              <View style={styles.daySlots}>
                {daySlots.length === 0 ? (
                  <Text style={styles.noSlot}>{"Pas de cours"}</Text>
                ) : (
                  daySlots.map(slot => (
                    <SlotCard
                      key={slot.courseId + dateStr}
                      slot={slot}
                      onPress={() => handleSlotPress(slot)}
                      opening={openingSlot === slot.courseId + slot.date}
                    />
                  ))
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  }, [slotsByDate, todayStr, dancerId, router, openingSlot]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>
        <View style={styles.weekHeader}>
          <Text style={styles.weekLabelText}>{weekLabel(weeks[currentIndex])}</Text>
          <Text style={styles.weekHint}>{"← swiper pour changer de semaine →"}</Text>
        </View>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            ref={flatRef}
            data={weeks}
            keyExtractor={d => d.toISOString()}
            renderItem={renderWeek}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={CENTER_INDEX}
            getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            style={styles.flatList}
          />
        )}
      </View>
    </View>
  );
}

function SlotCard({ slot, onPress, opening }: { slot: Slot; onPress: () => void; opening?: boolean }) {
  const cancelled = slot.status === 'cancelled';
  const accentColor = slot.style?.color ?? Colors.cardTeal;
  const borderColor = cancelled ? '#ddd' : accentColor;

  return (
    <Pressable
      style={[styles.slotCard, { borderLeftColor: borderColor }, cancelled && styles.slotCancelled]}
      onPress={onPress}
      disabled={opening}
    >
      <View style={styles.slotTop}>
        <Text style={[styles.slotName, cancelled && styles.slotNameCancelled]} numberOfLines={1}>
          {slot.courseName}
        </Text>
      </View>
      <Text style={[styles.slotMeta, cancelled && styles.slotMetaCancelled]}>
        {slot.startTime}–{slot.endTime}{slot.level ? ` · ${slot.level.name}` : ''}{slot.room ? ` · ${slot.room.name}` : ''}
        {cancelled ? '  ·  Annulé' : ''}
      </Text>
      {opening && <ActivityIndicator color={Colors.primary} size="small" style={{ marginTop: 4 }} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },

  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: '86%',
    backgroundColor: '#F9F7F4',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },

  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },

  weekHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  weekLabelText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  weekHint: { fontSize: 11, color: Colors.textLight, marginTop: 2 },

  flatList: { flex: 1 },
  weekContent: { paddingHorizontal: 16, paddingBottom: 32 },

  dayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  dayRowToday: {
    backgroundColor: 'rgba(47,134,192,0.05)',
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },

  dayLabel: { width: 48, alignItems: 'center', paddingTop: 2 },
  dayName: {
    fontSize: 11, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  dayNameToday: { color: '#2F86C0', fontWeight: '600' },
  dayNumWrap: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  dayNumToday: { backgroundColor: '#2F86C0' },
  dayNumText: { fontSize: 18, fontWeight: '500', color: '#444' },
  dayNumTextToday: { color: '#fff', fontWeight: '700', fontSize: 16 },

  daySlots: { flex: 1, gap: 7 },
  noSlot: { fontSize: 13, color: Colors.textLight, fontStyle: 'italic', paddingTop: 4 },

  slotCard: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 9,
    paddingLeft: 10,
    borderLeftWidth: 3,
  },
  slotCancelled: { opacity: 0.5 },
  slotTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 8, marginBottom: 3,
  },
  slotName: { fontSize: 13, fontWeight: '600', color: Colors.text, flex: 1 },
  slotNameCancelled: { textDecorationLine: 'line-through', color: '#bbb' },
  slotMeta: { fontSize: 11, color: Colors.textSecondary },
  slotMetaCancelled: { color: '#ccc' },
  styleBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  styleBadgeText: { fontSize: 10, fontWeight: '500' },
});
