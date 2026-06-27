import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { httpsCallable } from 'firebase/functions';
import {
  collection, getDocs, query, where, orderBy,
  addDoc, serverTimestamp, doc, onSnapshot,
} from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Line, Polyline } from 'react-native-svg';
import { Colors } from '@/constants/Colors';
import { usePagePermissions } from '@/contexts/PagePermissionsContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionOption {
  id: string;
  courseName: string;
  startTime: string;
  endTime: string;
}

type ScanResult =
  | { status: 'registered' | 'walk-in'; isTrial: boolean; dancerName: string; memberNumber: string | null }
  | { status: 'already_registered'; dancerName: string; memberNumber: string | null }
  | { status: 'error'; message: string };

type Phase = 'setup' | 'scanning';

const recordAttendanceFn = httpsCallable<
  { qrUid?: string; dancerId?: string; kioskSessionId: string },
  ScanResult
>(functions, 'recordAttendance');

// ── Icons ─────────────────────────────────────────────────────────────────────

function FlipIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function MirrorIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Line x1={12} y1={3} x2={12} y2={21} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeDasharray="2 2" />
      <Path d="M5 6l5 6-5 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M19 6l-5 6 5 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BackIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5m0 0l7 7m-7-7l7-7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Polyline points="20 6 9 17 4 12" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function XIcon({ color }: { color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Écran ─────────────────────────────────────────────────────────────────────

export default function KioskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasPerm } = usePagePermissions();

  // Permissions caméra
  const [cameraPermission, requestPermission] = useCameraPermissions();

  // Phase setup
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [opening, setOpening] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Phase scan
  const [phase, setPhase] = useState<Phase>('setup');
  const [kioskSessionId, setKioskSessionId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState('');
  const [scanCount, setScanCount] = useState(0);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [mirrored, setMirrored] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);

  const scanningRef = useRef(false);
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirige si pas de permission
  useEffect(() => {
    if (!hasPerm('/kiosk')) router.replace(`/dancer/${id}` as any);
  }, []);

  // Charge les séances du jour
  useEffect(() => {
    const today = toDateStr(new Date());
    Promise.all([
      getDocs(query(collection(db, 'sessions'), where('date', '==', today), orderBy('startTime'))),
      getDocs(collection(db, 'courses')),
    ]).then(([sessSnap, coursesSnap]) => {
      const courseMap: Record<string, string> = {};
      coursesSnap.docs.forEach(d => { courseMap[d.id] = d.data().name as string; });
      const list = sessSnap.docs
        .filter(d => d.data().status === 'scheduled')
        .map(d => ({
          id: d.id,
          courseName: courseMap[d.data().courseId as string] ?? 'Cours inconnu',
          startTime: d.data().startTime as string,
          endTime: d.data().endTime as string,
        }));
      setSessions(list);
      if (list.length === 1) setSelectedSessionId(list[0]!.id);
    }).catch(() => {}).finally(() => setLoadingSessions(false));
  }, []);

  // Écoute le compteur de présences en temps réel
  useEffect(() => {
    if (!kioskSessionId) return;
    const unsub = onSnapshot(
      query(collection(db, 'registrations'), where('kioskSessionId', '==', kioskSessionId)),
      snap => setScanCount(snap.size),
    );
    return unsub;
  }, [kioskSessionId]);

  const handleOpen = async () => {
    if (!selectedSessionId) return;
    setOpening(true);
    setSetupError(null);
    try {
      const session = sessions.find(s => s.id === selectedSessionId);
      const docRef = await addDoc(collection(db, 'kioskSessions'), {
        sessionId: selectedSessionId,
        courseId: '', // sera renseigné par la CF si besoin
        status: 'active',
        createdAt: serverTimestamp(),
      });
      setKioskSessionId(docRef.id);
      setCourseName(session?.courseName ?? '');
      if (!cameraPermission?.granted) await requestPermission();
      setPhase('scanning');
    } catch {
      setSetupError("Impossible d'ouvrir le kiosque. Réessaie.");
    } finally {
      setOpening(false);
    }
  };

  const showFeedback = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    Animated.sequence([
      Animated.timing(feedbackOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(feedbackOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      resetTimerRef.current = setTimeout(() => {
        scanningRef.current = false;
        setLastResult(null);
      }, 200);
    });
  };

  const handleBarcode = async ({ data }: { data: string }) => {
    if (scanningRef.current || processing || !kioskSessionId) return;
    scanningRef.current = true;
    setProcessing(true);
    try {
      const res = await recordAttendanceFn({ qrUid: data, kioskSessionId });
      setLastResult(res.data);
    } catch (e: unknown) {
      setLastResult({ status: 'error', message: 'Erreur de connexion.' });
    } finally {
      setProcessing(false);
      showFeedback();
    }
  };

  const handleClose = async () => {
    if (kioskSessionId) {
      import('firebase/firestore').then(({ updateDoc, doc: fdoc, serverTimestamp: st }) => {
        updateDoc(fdoc(db, 'kioskSessions', kioskSessionId), { status: 'closed', closedAt: st() }).catch(() => {});
      });
    }
    router.back();
  };

  // ── Phase setup ───────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <BackIcon color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Kiosque de pointage</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.setupContent, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.sectionLabel}>Séance du jour</Text>

          {loadingSessions ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
          ) : sessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Aucune séance planifiée aujourd'hui.</Text>
            </View>
          ) : (
            <View style={styles.sessionList}>
              {sessions.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.sessionRow, selectedSessionId === s.id && styles.sessionRowSelected]}
                  onPress={() => setSelectedSessionId(s.id)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.sessionRadio, selectedSessionId === s.id && styles.sessionRadioSelected]}>
                    {selectedSessionId === s.id && <View style={styles.sessionRadioDot} />}
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={[styles.sessionName, selectedSessionId === s.id && styles.sessionNameSelected]}>
                      {s.courseName}
                    </Text>
                    <Text style={styles.sessionTime}>{s.startTime} – {s.endTime}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {setupError && <Text style={styles.errorText}>{setupError}</Text>}

          <TouchableOpacity
            style={[styles.openBtn, (!selectedSessionId || opening) && styles.openBtnDisabled]}
            onPress={handleOpen}
            disabled={!selectedSessionId || opening}
            activeOpacity={0.8}
          >
            {opening ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.openBtnText}>Ouvrir le kiosque</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Phase scan ────────────────────────────────────────────────────────────

  const isSuccess = lastResult && lastResult.status !== 'error';
  const isError   = lastResult?.status === 'error';
  const isAlready = lastResult?.status === 'already_registered';

  return (
    <View style={styles.root}>
      {/* Caméra */}
      <View style={[styles.cameraWrap, mirrored && styles.mirrored]}>
        {cameraPermission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing={facing}
            onBarcodeScanned={handleBarcode}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.permDenied]}>
            <Text style={styles.permDeniedText}>Permission caméra requise</Text>
            <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
              <Text style={styles.permBtnText}>Autoriser</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Overlay viseur */}
        <View style={styles.viewfinder} pointerEvents="none">
          <View style={styles.corner} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
      </View>

      {/* Barre supérieure */}
      <View style={[styles.scanTopBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={handleClose} style={styles.scanBtn} activeOpacity={0.7}>
          <BackIcon color="#fff" />
        </TouchableOpacity>
        <View style={styles.courseChip}>
          <Text style={styles.courseChipText} numberOfLines={1}>{courseName}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{scanCount}</Text>
          </View>
        </View>
        <View style={styles.scanBtnRow}>
          <TouchableOpacity
            onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
            style={styles.scanBtn}
            activeOpacity={0.7}
          >
            <FlipIcon color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMirrored(m => !m)}
            style={[styles.scanBtn, mirrored && styles.scanBtnActive]}
            activeOpacity={0.7}
          >
            <MirrorIcon color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Feedback scan */}
      <Animated.View
        style={[
          styles.feedback,
          { bottom: insets.bottom + 40, opacity: feedbackOpacity },
          isSuccess && !isAlready && styles.feedbackSuccess,
          isAlready && styles.feedbackAlready,
          isError && styles.feedbackError,
        ]}
        pointerEvents="none"
      >
        <View style={styles.feedbackIcon}>
          {isError ? <XIcon color="#fff" /> : <CheckIcon color="#fff" />}
        </View>
        <View style={styles.feedbackBody}>
          {lastResult && lastResult.status !== 'error' && (
            <>
              <Text style={styles.feedbackName}>{lastResult.dancerName}</Text>
              {lastResult.memberNumber && (
                <Text style={styles.feedbackSub}>#{lastResult.memberNumber}</Text>
              )}
              {isAlready && <Text style={styles.feedbackSub}>Déjà pointé</Text>}
              {lastResult.status === 'walk-in' && <Text style={styles.feedbackSub}>Entrée libre</Text>}
            </>
          )}
          {isError && lastResult.status === 'error' && (
            <Text style={styles.feedbackName}>{lastResult.message}</Text>
          )}
        </View>
      </Animated.View>

      {/* Indicateur traitement */}
      {processing && (
        <View style={styles.processingOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  // Setup
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  topBarTitle: { fontSize: 17, fontWeight: '600', color: Colors.text },
  setupContent: { padding: 20, gap: 0 },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  sessionList: { gap: 10, marginBottom: 24 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  sessionRowSelected: { borderColor: Colors.primary },
  sessionRadio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  sessionRadioSelected: { borderColor: Colors.primary },
  sessionRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  sessionInfo: { flex: 1 },
  sessionName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  sessionNameSelected: { color: Colors.primary },
  sessionTime: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  errorText: { fontSize: 13, color: '#EF4444', marginBottom: 12, textAlign: 'center' },
  openBtn: {
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  openBtnDisabled: { opacity: 0.4 },
  openBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Scanner
  cameraWrap: { ...StyleSheet.absoluteFillObject },
  mirrored: { transform: [{ scaleX: -1 }] },

  viewfinder: {
    position: 'absolute', top: '30%', left: '15%', right: '15%', bottom: '30%',
  },
  corner: {
    position: 'absolute', top: 0, left: 0,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderColor: '#fff',
    borderTopLeftRadius: 4,
  },
  cornerTR: { left: undefined, right: 0, borderLeftWidth: 0, borderRightWidth: CORNER_WIDTH, borderTopRightRadius: 4, borderTopLeftRadius: 0 },
  cornerBL: { top: undefined, bottom: 0, borderTopWidth: 0, borderBottomWidth: CORNER_WIDTH, borderBottomLeftRadius: 4, borderTopLeftRadius: 0 },
  cornerBR: { top: undefined, bottom: 0, left: undefined, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderBottomRightRadius: 4 },

  scanTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scanBtnRow: { flexDirection: 'row', gap: 4 },
  scanBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  scanBtnActive: { backgroundColor: 'rgba(59,130,246,0.6)' },

  courseChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: 8,
  },
  courseChipText: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1, textAlign: 'center' },
  countBadge: {
    backgroundColor: Colors.primary, borderRadius: 12, minWidth: 28, height: 28,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  countText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  feedback: {
    position: 'absolute', left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#1F2937', borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  feedbackSuccess: { backgroundColor: '#059669' },
  feedbackAlready: { backgroundColor: '#D97706' },
  feedbackError:   { backgroundColor: '#DC2626' },
  feedbackIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', shrink: 0,
  },
  feedbackBody: { flex: 1 },
  feedbackName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  feedbackSub:  { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },

  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },

  permDenied: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  permDeniedText: { color: '#fff', fontSize: 16, marginBottom: 16 },
  permBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  permBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
