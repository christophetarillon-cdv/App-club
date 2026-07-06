import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
  TextInput, Pressable, Platform, Keyboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, collection, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/Colors';
import VideoUploadSheet from '@/components/VideoUploadSheet';
import VideoPlayerSheet from '@/components/VideoPlayerSheet';
import type { Media } from '@cdv/types';

const DAY_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_FR[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]}`;
}

interface SessionData {
  id: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  programNote?: string;
}
interface CourseData { id: string; name: string; danceStyleId: string; levelId: string; roomId: string; seasonId: string; }

export default function SessionDetailScreen() {
  const { id: dancerId, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dancers } = useAuth();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [course, setCourse] = useState<CourseData | null>(null);
  const [styleName, setStyleName] = useState('');
  const [styleColor, setStyleColor] = useState(Colors.cardTeal);
  const [levelName, setLevelName] = useState('');
  const [roomName, setRoomName] = useState('');

  const [uploadRoles, setUploadRoles] = useState<string[]>([]);
  const [viewRoles, setViewRoles] = useState<string[]>([]);
  const [noteViewRoles, setNoteViewRoles] = useState<string[]>([]);
  const [noteEditRoles, setNoteEditRoles] = useState<string[]>([]);

  const [videos, setVideos] = useState<Media[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<Media | null>(null);

  const [noteText, setNoteText] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(Math.max(0, e.endCoordinates.height - insets.bottom));
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, [insets.bottom]);

  // Rôles du danseur ACTIF (celui de la route), pas de tous les danseurs du
  // compte — sur un compte famille, un autre danseur (ex: moniteur) ne doit
  // pas donner ses droits au danseur actuellement affiché.
  const callerRoles = useMemo(() => {
    return dancers.find(d => d.id === dancerId)?.roles ?? [];
  }, [dancers, dancerId]);
  const isAdmin = callerRoles.includes('admin');
  const canUploadVideo = isAdmin || callerRoles.some(r => uploadRoles.includes(r));
  const canViewVideo = isAdmin || callerRoles.some(r => viewRoles.includes(r));
  const canViewNote = isAdmin || callerRoles.some(r => noteViewRoles.includes(r));
  const canEditNote = isAdmin || callerRoles.some(r => noteEditRoles.includes(r));

  const load = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
      if (!sessionSnap.exists()) { setLoading(false); return; }
      const s = { id: sessionSnap.id, ...sessionSnap.data() } as SessionData;
      setSession(s);
      setNoteText(s.programNote ?? '');

      const [courseSnap, settingsSnap, mediaSnap] = await Promise.all([
        getDoc(doc(db, 'courses', s.courseId)),
        getDoc(doc(db, 'appSettings', 'main')),
        getDocs(query(collection(db, 'media'), where('sessionId', '==', s.id))),
      ]);

      setUploadRoles(settingsSnap.data()?.sessionVideoUploadRoles ?? []);
      setViewRoles(settingsSnap.data()?.sessionVideoViewRoles ?? []);
      setNoteViewRoles(settingsSnap.data()?.sessionNoteViewRoles ?? []);
      setNoteEditRoles(settingsSnap.data()?.sessionNoteEditRoles ?? []);
      setVideos(mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as Media)));

      if (courseSnap.exists()) {
        const c = { id: courseSnap.id, ...courseSnap.data() } as CourseData;
        setCourse(c);
        const [styleSnap, levelSnap, roomSnap] = await Promise.all([
          c.danceStyleId ? getDoc(doc(db, 'danceStyles', c.danceStyleId)) : null,
          c.levelId ? getDoc(doc(db, 'levels', c.levelId)) : null,
          c.roomId ? getDoc(doc(db, 'rooms', c.roomId)) : null,
        ]);
        if (styleSnap?.exists()) {
          setStyleName(styleSnap.data().name ?? '');
          setStyleColor(styleSnap.data().color ?? Colors.cardTeal);
        }
        if (levelSnap?.exists()) setLevelName(levelSnap.data().name ?? '');
        if (roomSnap?.exists()) setRoomName(roomSnap.data().name ?? '');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [sessionId]);

  const handleSaveNote = async () => {
    if (!session) return;
    setSavingNote(true);
    try {
      await updateDoc(doc(db, 'sessions', session.id), { programNote: noteText.trim() });
      setSession(prev => prev ? { ...prev, programNote: noteText.trim() } : prev);
      setEditingNote(false);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />
      <View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16, transform: [{ translateY: -keyboardHeight }] },
        ]}
      >
        <View style={styles.handleWrap}><View style={styles.handle} /></View>

        {loading || !session ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Text style={styles.courseName}>{course?.name ?? '—'}</Text>
                {styleName && (
                  <View style={[styles.styleBadge, { backgroundColor: `${styleColor}25` }]}>
                    <Text style={[styles.styleBadgeText, { color: styleColor }]}>{styleName}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.meta}>
                {formatDate(session.date)} · {session.startTime}–{session.endTime}
                {levelName ? ` · ${levelName}` : ''}{roomName ? ` · ${roomName}` : ''}
              </Text>
              {session.status === 'cancelled' && <Text style={styles.cancelledTag}>Séance annulée</Text>}
            </View>

            {/* Programme du jour */}
            {canViewNote && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Programme</Text>
              {editingNote ? (
                <>
                  <TextInput
                    style={styles.noteInput}
                    value={noteText}
                    onChangeText={setNoteText}
                    multiline
                    placeholder="Programme de la séance…"
                    placeholderTextColor={Colors.textLight}
                    autoFocus
                  />
                  <View style={styles.noteActions}>
                    <TouchableOpacity onPress={() => { setEditingNote(false); setNoteText(session.programNote ?? ''); }} style={styles.noteBtnGhost}>
                      <Text style={styles.noteBtnGhostText}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSaveNote} disabled={savingNote} style={styles.noteBtn}>
                      {savingNote ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.noteBtnText}>Enregistrer</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <TouchableOpacity
                  activeOpacity={canEditNote ? 0.7 : 1}
                  onPress={() => canEditNote && setEditingNote(true)}
                  style={styles.noteDisplay}
                >
                  {session.programNote ? (
                    <Text style={styles.noteText}>{session.programNote}</Text>
                  ) : (
                    <Text style={styles.noteEmpty}>{canEditNote ? 'Ajouter un programme…' : 'Aucun programme renseigné.'}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
            )}

            {/* Vidéo */}
            {(canViewVideo && videos.length > 0) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Vidéo</Text>
                {videos.map(v => (
                  <TouchableOpacity key={v.id} style={styles.videoRow} onPress={() => setPlayingVideo(v)} activeOpacity={0.8}>
                    <View style={[styles.videoIcon, { backgroundColor: `${styleColor}25` }]}>
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                        <Path d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" fill={styleColor} />
                      </Svg>
                    </View>
                    <Text style={styles.videoTitle} numberOfLines={1}>{v.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {(canUploadVideo && videos.length === 0) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Vidéo</Text>
                <TouchableOpacity style={styles.addVideoBtn} onPress={() => setShowUpload(true)} activeOpacity={0.8}>
                  <Text style={styles.addVideoBtnText}>+ Ajouter une vidéo</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {showUpload && course && (
        <VideoUploadSheet
          seasons={[]}
          danceStyles={[]}
          fixedAttachedTo={`session:${session!.id}`}
          fixedSeasonId={course.seasonId}
          actingDancerId={dancerId}
          onClose={() => setShowUpload(false)}
          onUploaded={load}
        />
      )}
      {playingVideo && (
        <VideoPlayerSheet
          video={playingVideo}
          styleColor={styleColor}
          seasonBadge=""
          onClose={() => setPlayingVideo(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    maxHeight: '80%',
    backgroundColor: '#F9F7F4',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },

  content: { paddingHorizontal: 20, paddingBottom: 24 },
  header: { paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.08)', marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courseName: { fontSize: 18, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  styleBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  styleBadgeText: { fontSize: 11, fontWeight: '600' },
  meta: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  cancelledTag: { fontSize: 12, color: '#DC2626', fontWeight: '600', marginTop: 6 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },

  noteDisplay: { backgroundColor: '#fff', borderRadius: 12, padding: 12, minHeight: 44, justifyContent: 'center' },
  noteText: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  noteEmpty: { fontSize: 14, color: Colors.textLight, fontStyle: 'italic' },
  noteInput: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12, minHeight: 90,
    fontSize: 14, color: Colors.text, textAlignVertical: 'top',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
  },
  noteActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  noteBtnGhost: { paddingVertical: 9, paddingHorizontal: 14 },
  noteBtnGhostText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  noteBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  noteBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },

  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  videoIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  videoTitle: { fontSize: 14, fontWeight: '500', color: Colors.text, flex: 1 },

  addVideoBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addVideoBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
});
