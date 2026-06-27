'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, onSnapshot, query, updateDoc, serverTimestamp, where } from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import Link from 'next/link';

type ScanResult =
  | { status: 'registered' | 'walk-in'; isTrial: boolean; dancerName: string; memberNumber: string | null }
  | { status: 'already_registered'; dancerName: string; memberNumber: string | null }
  | { status: 'error'; message: string };

interface AttendeeInfo {
  dancerId: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
}

const recordAttendanceFn = httpsCallable<
  { qrUid?: string; dancerId?: string; kioskSessionId: string },
  ScanResult
>(functions, 'recordAttendance');

// ── Icons ─────────────────────────────────────────────────────────────────────

const CheckCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16">
    <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16">
    <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
  </svg>
);

const XCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16">
    <path d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CameraFrontIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
    <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

const CameraBackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
    <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
    <path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
  </svg>
);

const SwitchCameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

const ListIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KioskScanPage() {
  const { id: kioskSessionId } = useParams<{ id: string }>();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanningRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [kioskActive, setKioskActive] = useState(true);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [courseName, setCourseName] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [sessionTime, setSessionTime] = useState('');
  const [danceStyle, setDanceStyle] = useState('');
  const [level, setLevel] = useState('');
  const [mirrored, setMirrored] = useState(false);
  const cameraKey = `kiosk_camera_${kioskSessionId}`;
  const [cameraFacing, setCameraFacingState] = useState<'user' | 'environment' | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = sessionStorage.getItem(`kiosk_camera_${kioskSessionId}`);
    return (saved === 'user' || saved === 'environment') ? saved : null;
  });

  const setCameraFacing = (val: 'user' | 'environment' | null | ((prev: 'user' | 'environment' | null) => 'user' | 'environment' | null)) => {
    setCameraFacingState(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (next) sessionStorage.setItem(cameraKey, next);
      else sessionStorage.removeItem(cameraKey);
      return next;
    });
  };
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [attendanceDancerIds, setAttendanceDancerIds] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);

  const scanCount = attendanceDancerIds.length;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'kioskSessions', kioskSessionId), async (snap) => {
      if (!snap.exists() || snap.data()?.status !== 'active') {
        setKioskActive(false);
        return;
      }
      const { sessionId, courseId } = snap.data() as { sessionId: string; courseId: string };
      setCurrentSessionId(sessionId);

      const [courseSnap, sessionSnap] = await Promise.all([
        getDoc(doc(db, 'courses', courseId)),
        getDoc(doc(db, 'sessions', sessionId)),
      ]);

      if (courseSnap.exists()) {
        const c = courseSnap.data()!;
        setCourseName(c.name ?? '');
        const [styleSnap, levelSnap] = await Promise.all([
          c.danceStyleId ? getDoc(doc(db, 'danceStyles', c.danceStyleId)) : Promise.resolve(null),
          c.levelId      ? getDoc(doc(db, 'levels',      c.levelId))      : Promise.resolve(null),
        ]);
        if (styleSnap?.exists()) setDanceStyle(styleSnap.data()?.name ?? '');
        if (levelSnap?.exists()) setLevel(levelSnap.data()?.name ?? '');
      }

      if (sessionSnap.exists()) {
        const s = sessionSnap.data()!;
        const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
        const d = new Date(s.date + 'T12:00:00');
        setSessionDate(`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`);
        setSessionTime(`${s.startTime} – ${s.endTime}`);
      }
    });
    return () => unsub();
  }, [kioskSessionId]);

  useEffect(() => {
    if (!currentSessionId) return;
    const q = query(collection(db, 'attendances'), where('sessionId', '==', currentSessionId));
    const unsub = onSnapshot(q, snap => {
      setAttendanceDancerIds(snap.docs.map(d => d.data().dancerId as string));
    });
    return () => unsub();
  }, [currentSessionId]);

  const resetScan = useCallback(() => {
    setScanResult(null);
    setProcessing(false);
    scanningRef.current = false;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const handleScan = useCallback(async (qrUid: string) => {
    if (scanningRef.current || processing) return;
    scanningRef.current = true;
    setProcessing(true);
    setScanResult(null);
    try {
      const res = await recordAttendanceFn({ qrUid, kioskSessionId });
      setScanResult(res.data);
    } catch (err: any) {
      const msg: string = err?.message ?? 'Erreur inconnue';
      setScanResult({ status: 'error', message: msg });
    } finally {
      setProcessing(false);
      resetTimerRef.current = setTimeout(resetScan, 4000);
    }
  }, [kioskSessionId, processing, resetScan]);

  const handleScanRef = useRef(handleScan);
  useEffect(() => { handleScanRef.current = handleScan; }, [handleScan]);

  useEffect(() => {
    if (!kioskActive || !videoRef.current || cameraFacing === null) return;
    let reader: any;
    let stopped = false;
    let localStream: MediaStream | null = null;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: cameraFacing } },
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        localStream = stream;
        const facing = stream.getVideoTracks()[0]?.getSettings().facingMode;
        setMirrored(facing === 'user' || facing === undefined);
        const video = videoRef.current;
        if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play().catch(() => {});
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (stopped) return;
        reader = new BrowserMultiFormatReader();
        reader.decodeFromVideoElement(video, (result: any) => {
          if (stopped) return;
          if (result && !scanningRef.current) handleScanRef.current(result.getText());
        });
      } catch {
        setCameraError("Impossible d'accéder à la caméra.");
      }
    };

    start();
    return () => {
      stopped = true;
      try { reader?.reset(); } catch {}
      localStream?.getTracks().forEach(t => t.stop());
      localStream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [kioskActive, cameraFacing]);

  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);

  const handleClose = async () => {
    await updateDoc(doc(db, 'kioskSessions', kioskSessionId), {
      status: 'closed',
      closedAt: serverTimestamp(),
    });
    router.push('/kiosk/setup');
  };

  // ── Kiosk fermé ─────────────────────────────────────────────────────────────
  if (!kioskActive) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-5 text-gray-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
            <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <p className="text-xl font-semibold text-white mb-1">Session fermée</p>
        <p className="text-gray-400 text-sm mb-6">Ce kiosque n'est plus actif</p>
        <Link
          href="/kiosk/setup"
          className="px-5 py-2.5 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors"
        >
          Ouvrir un nouveau kiosque
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          {/* Pill séance */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
            <span className="text-white font-semibold text-sm">{courseName || '…'}</span>
          </div>
          {(danceStyle || level || sessionTime) && (
            <div className="hidden sm:flex items-center gap-1.5">
              {danceStyle && <span className="text-xs text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full">{danceStyle}</span>}
              {level && <span className="text-xs text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full">{level}</span>}
              {sessionTime && <span className="text-xs text-gray-500">{sessionTime}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/kiosk/${kioskSessionId}/search`}
            className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Recherche manuelle
          </Link>
          <button
            onClick={handleClose}
            className="px-3.5 py-2 bg-red-950/60 hover:bg-red-900/60 border border-red-900/50 rounded-xl text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>

      {/* ── Infos séance ── */}
      <div className="text-center px-6 pt-5 pb-3">
        {sessionDate && (
          <p className="text-gray-400 text-sm font-medium capitalize">{sessionDate}</p>
        )}
        <p className="text-2xl font-bold text-white mt-1">{courseName || '…'}</p>
        <div className="flex items-center justify-center gap-3 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-3xl font-bold text-white tabular-nums">{scanCount}</span>
            <span className="text-gray-400 text-sm">
              personne{scanCount !== 1 ? 's' : ''} pointée{scanCount !== 1 ? 's' : ''}
            </span>
          </div>
          {scanCount > 0 && (
            <button
              onClick={() => setShowList(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg bg-blue-950/50 border border-blue-900/50 hover:border-blue-700/50 transition-colors"
            >
              <ListIcon />
              Voir la liste
            </button>
          )}
        </div>
      </div>

      {/* ── Zone de scan ── */}
      <div className="flex-1 flex flex-col items-center justify-center relative p-4">

        {cameraError ? (
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-red-950/60 border border-red-900/50 flex items-center justify-center mx-auto text-red-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">Caméra inaccessible</p>
              <p className="text-gray-400 text-sm">{cameraError}</p>
            </div>
            <Link
              href={`/kiosk/${kioskSessionId}/search`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors"
            >
              Utiliser la recherche manuelle
            </Link>
          </div>

        ) : cameraFacing === null ? (
          <div className="text-center space-y-6 max-w-sm w-full">
            <div>
              <p className="text-white text-xl font-bold mb-1">Choisir la caméra</p>
              <p className="text-gray-400 text-sm">La caméra frontale fait face aux danseurs.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setCameraFacing('user')}
                className="flex flex-col items-center gap-3 bg-gray-800 hover:bg-primary/20 border-2 border-gray-700 hover:border-primary/50 rounded-2xl px-4 py-6 transition-all text-gray-300 hover:text-white"
              >
                <CameraFrontIcon />
                <div>
                  <p className="font-semibold text-sm">Caméra frontale</p>
                  <p className="text-gray-500 text-xs mt-0.5">Face aux danseurs</p>
                </div>
              </button>
              <button
                onClick={() => setCameraFacing('environment')}
                className="flex flex-col items-center gap-3 bg-gray-800 hover:bg-primary/20 border-2 border-gray-700 hover:border-primary/50 rounded-2xl px-4 py-6 transition-all text-gray-300 hover:text-white"
              >
                <CameraBackIcon />
                <div>
                  <p className="font-semibold text-sm">Caméra arrière</p>
                  <p className="text-gray-500 text-xs mt-0.5">Caméra principale</p>
                </div>
              </button>
            </div>
          </div>

        ) : (
          <>
            <video
              ref={videoRef}
              className={`w-full max-w-sm rounded-2xl object-cover aspect-square bg-gray-900 ${scanResult ? 'opacity-20' : 'opacity-100'} transition-opacity duration-200 ${mirrored ? 'scale-x-[-1]' : ''}`}
              autoPlay
              muted
              playsInline
            />

            {/* Viseur */}
            {!scanResult && !processing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-52 h-52 relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-primary rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-primary rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-primary rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-primary rounded-br-xl" />
                </div>
              </div>
            )}

            {/* Traitement */}
            {processing && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-gray-900/95 rounded-2xl px-8 py-6 text-center border border-gray-700">
                  <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white font-medium text-sm">Vérification…</p>
                </div>
              </div>
            )}

            {/* Résultat */}
            {scanResult && !processing && (
              <div
                className="absolute inset-0 flex items-center justify-center p-6 cursor-pointer"
                onClick={resetScan}
              >
                <ResultCard result={scanResult} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Pied ── */}
      {cameraFacing !== null && !scanResult && !processing && (
        <div className="py-4 flex items-center justify-center gap-4">
          <p className="text-gray-500 text-sm">Présentez votre QR code devant la caméra</p>
          <button
            onClick={() => { setCameraFacing(f => f === 'user' ? 'environment' : 'user'); setCameraError(null); }}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-xs px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-600 transition-colors"
          >
            <SwitchCameraIcon />
            {cameraFacing === 'user' ? 'Caméra arrière' : 'Caméra frontale'}
          </button>
        </div>
      )}

      {/* ── Modal liste ── */}
      {showList && (
        <AttendeeListModal
          dancerIds={attendanceDancerIds}
          count={scanCount}
          onClose={() => setShowList(false)}
        />
      )}
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: ScanResult }) {
  const isSuccess = result.status === 'registered' || result.status === 'walk-in';
  const isAlready = result.status === 'already_registered';

  const config = isSuccess
    ? { bg: 'bg-green-950/95 border-green-800', icon: <CheckCircleIcon />, iconColor: 'text-green-400', label: result.status === 'walk-in' ? 'Présence enregistrée (visiteur)' : 'Présence enregistrée' }
    : isAlready
    ? { bg: 'bg-amber-950/95 border-amber-800', icon: <AlertCircleIcon />, iconColor: 'text-amber-400', label: "Déjà pointé aujourd'hui" }
    : { bg: 'bg-red-950/95 border-red-900', icon: <XCircleIcon />, iconColor: 'text-red-400', label: 'message' in result ? result.message : 'Erreur' };

  return (
    <div className={`w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl border ${config.bg}`}>
      <div className={`flex justify-center mb-4 ${config.iconColor}`}>
        {config.icon}
      </div>

      {(isSuccess || isAlready) && (
        <>
          <p className="text-2xl font-bold text-white mb-1">
            {'dancerName' in result ? result.dancerName : ''}
          </p>
          {'memberNumber' in result && result.memberNumber && (
            <p className="text-gray-400 font-mono text-sm mb-3">{result.memberNumber}</p>
          )}
        </>
      )}

      <p className={`font-semibold text-base ${config.iconColor}`}>{config.label}</p>

      {'isTrial' in result && result.isTrial && isSuccess && (
        <span className="mt-3 inline-block text-xs font-semibold bg-amber-900/50 text-amber-300 border border-amber-800/50 px-3 py-1 rounded-full">
          {"Cours d'essai"}
        </span>
      )}

      <p className="text-gray-600 text-xs mt-5">Appuyer pour continuer</p>
    </div>
  );
}

// ── Attendee list modal ───────────────────────────────────────────────────────

function AttendeeListModal({ dancerIds, count, onClose }: { dancerIds: string[]; count: number; onClose: () => void }) {
  const [attendees, setAttendees] = useState<AttendeeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (dancerIds.length === 0) { setLoading(false); return; }
    Promise.all(
      dancerIds.map(id =>
        getDoc(doc(db, 'dancers', id)).then(snap => {
          if (!snap.exists()) return null;
          const d = snap.data()!;
          return { dancerId: id, firstName: d.firstName ?? '', lastName: d.lastName ?? '', photoUrl: d.photoUrl } as AttendeeInfo;
        })
      )
    ).then(results => {
      const valid = results.filter(Boolean) as AttendeeInfo[];
      valid.sort((a, b) => {
        const last = a.lastName.localeCompare(b.lastName, 'fr');
        return last !== 0 ? last : a.firstName.localeCompare(b.firstName, 'fr');
      });
      setAttendees(valid);
    }).finally(() => setLoading(false));
  }, [dancerIds]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950/98 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white">Liste des présences</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {count} personne{count !== 1 ? 's' : ''} pointée{count !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : attendees.length === 0 ? (
          <p className="text-center text-gray-500 py-16 text-sm">Aucun participant</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {attendees.map(a => (
              <div key={a.dancerId} className="flex flex-col items-center gap-2.5 bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <DancerAvatar firstName={a.firstName} lastName={a.lastName} photoUrl={a.photoUrl} />
                <div className="text-center">
                  <p className="text-white font-semibold text-sm leading-tight">{a.firstName}</p>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mt-0.5">{a.lastName}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DancerAvatar({ firstName, lastName, photoUrl }: { firstName: string; lastName: string; photoUrl?: string }) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  const colors = ['bg-blue-600', 'bg-purple-600', 'bg-green-600', 'bg-pink-600', 'bg-orange-500', 'bg-teal-600', 'bg-red-600', 'bg-indigo-600'];
  const color = colors[(firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length];

  if (photoUrl) {
    return <img src={photoUrl} alt={`${firstName} ${lastName}`} className="w-14 h-14 rounded-full object-cover" />;
  }
  return (
    <div className={`w-14 h-14 rounded-full flex items-center justify-center ${color} shrink-0`}>
      <span className="text-white font-bold text-base">{initials}</span>
    </div>
  );
}
