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
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment' | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [attendanceDancerIds, setAttendanceDancerIds] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);

  const scanCount = attendanceDancerIds.length;

  // Charger info kiosque
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

  // Suivi en temps réel des présences
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

  // Initialiser le scanner de QR code
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
          if (result && !scanningRef.current) {
            handleScanRef.current(result.getText());
          }
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

  // Plein écran sur tablette
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

  if (!kioskActive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="text-2xl mb-4">Session kiosque fermée</p>
        <Link href="/kiosk/setup" className="text-blue-400 underline">Ouvrir un nouveau kiosque</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gray-800 border-b border-gray-700">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Kiosque</p>
          <p className="font-semibold text-white">{courseName || '…'}</p>
        </div>
        <div className="flex gap-3">
          <Link href={`/kiosk/${kioskSessionId}/search`}
            className="px-4 py-2 bg-gray-700 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors">
            Recherche manuelle
          </Link>
          <button onClick={handleClose}
            className="px-4 py-2 bg-red-800/60 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors text-red-300">
            Fermer
          </button>
        </div>
      </div>

      {/* Infos séance */}
      <div className="text-center px-6 pt-6 pb-2">
        {sessionDate && (
          <p className="text-3xl font-bold text-white">{sessionDate}</p>
        )}
        <p className="text-2xl font-semibold text-white mt-1">{courseName || '…'}</p>
        <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
          {danceStyle && <p className="text-xl text-blue-300 font-medium">{danceStyle}</p>}
          {danceStyle && level && <span className="text-gray-500">·</span>}
          {level && <p className="text-xl text-blue-300 font-medium">{level}</p>}
          {sessionTime && <span className="text-gray-500">·</span>}
          {sessionTime && <p className="text-xl text-gray-300">{sessionTime}</p>}
        </div>
        <div className="flex items-center justify-center gap-3 mt-2">
          <p className="text-lg text-gray-400">
            <span className="text-white font-bold text-2xl">{scanCount}</span>
            {' '}personne{scanCount !== 1 ? 's' : ''} pointée{scanCount !== 1 ? 's' : ''}
          </p>
          {scanCount > 0 && (
            <button
              onClick={() => setShowList(true)}
              className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 px-3 py-1 rounded-lg border border-blue-800 hover:border-blue-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              Voir la liste
            </button>
          )}
        </div>
      </div>

      {/* Zone de scan */}
      <div className="flex-1 flex flex-col items-center justify-center relative p-4">
        {cameraError ? (
          <div className="text-center space-y-4">
            <p className="text-red-400 text-lg">{cameraError}</p>
            <Link href={`/kiosk/${kioskSessionId}/search`}
              className="inline-block px-6 py-3 bg-blue-600 rounded-xl text-white font-semibold">
              Utiliser la recherche manuelle
            </Link>
          </div>
        ) : cameraFacing === null ? (
          <div className="text-center space-y-6 max-w-sm w-full">
            <p className="text-white text-xl font-semibold">Choisissez la caméra</p>
            <p className="text-gray-400 text-sm">La caméra frontale fait face aux danseurs qui se présentent devant la tablette.</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setCameraFacing('user')}
                className="flex flex-col items-center gap-3 bg-gray-800 hover:bg-blue-700 border-2 border-gray-600 hover:border-blue-500 rounded-2xl px-4 py-6 transition-colors"
              >
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <span className="text-white font-semibold text-sm">Caméra frontale</span>
                <span className="text-gray-400 text-xs">Face aux danseurs</span>
              </button>
              <button
                onClick={() => setCameraFacing('environment')}
                className="flex flex-col items-center gap-3 bg-gray-800 hover:bg-blue-700 border-2 border-gray-600 hover:border-blue-500 rounded-2xl px-4 py-6 transition-colors"
              >
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
                <span className="text-white font-semibold text-sm">Caméra arrière</span>
                <span className="text-gray-400 text-xs">Caméra principale</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className={`w-full max-w-sm rounded-2xl object-cover aspect-square bg-black ${scanResult ? 'opacity-30' : 'opacity-100'} transition-opacity ${mirrored ? 'scale-x-[-1]' : ''}`}
              autoPlay
              muted
              playsInline
            />

            {/* Viseur */}
            {!scanResult && !processing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-56 border-4 border-white/40 rounded-2xl relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-xl" />
                </div>
              </div>
            )}

            {processing && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-gray-800/90 rounded-2xl px-8 py-6 text-center">
                  <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white font-medium">Vérification…</p>
                </div>
              </div>
            )}

            {scanResult && !processing && (
              <div
                className="absolute inset-0 flex items-center justify-center p-6 cursor-pointer"
                onClick={resetScan}
              >
                <ResultCard result={scanResult} onDismiss={resetScan} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Pied de page */}
      {cameraFacing !== null && !scanResult && !processing && (
        <div className="py-4 flex items-center justify-center gap-6">
          <p className="text-gray-500 text-sm">Présentez votre QR code devant la caméra</p>
          <button
            onClick={() => {
              setCameraFacing(f => f === 'user' ? 'environment' : 'user');
              setCameraError(null);
            }}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
            title="Changer de caméra"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {cameraFacing === 'user' ? 'Caméra arrière' : 'Caméra frontale'}
          </button>
        </div>
      )}

      {/* Modal liste des présences */}
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
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/95 backdrop-blur-sm">
      {/* En-tête modal */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-700 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white">Liste des présences</h2>
          <p className="text-gray-400 text-sm mt-0.5">{count} personne{count !== 1 ? 's' : ''} pointée{count !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors"
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Corps */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : attendees.length === 0 ? (
          <p className="text-center text-gray-500 py-16">Aucun participant</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {attendees.map(a => (
              <div key={a.dancerId} className="flex flex-col items-center gap-2 bg-gray-800 rounded-2xl p-4">
                <Avatar firstName={a.firstName} lastName={a.lastName} photoUrl={a.photoUrl} />
                <p className="text-white font-semibold text-sm text-center leading-tight">
                  {a.firstName}
                </p>
                <p className="text-gray-400 text-xs text-center uppercase tracking-wide">
                  {a.lastName}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ firstName, lastName, photoUrl }: { firstName: string; lastName: string; photoUrl?: string }) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  const colors = [
    'bg-blue-600', 'bg-purple-600', 'bg-green-600', 'bg-pink-600',
    'bg-orange-500', 'bg-teal-600', 'bg-red-600', 'bg-indigo-600',
  ];
  const color = colors[(firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length];

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`${firstName} ${lastName}`}
        className="w-16 h-16 rounded-full object-cover"
      />
    );
  }
  return (
    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${color} shrink-0`}>
      <span className="text-white font-bold text-lg">{initials}</span>
    </div>
  );
}

function ResultCard({ result, onDismiss }: { result: ScanResult; onDismiss: () => void }) {
  const isSuccess = result.status === 'registered' || result.status === 'walk-in';
  const isAlready = result.status === 'already_registered';
  const isError = result.status === 'error';

  return (
    <div className={`w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl ${
      isSuccess ? 'bg-green-600' : isAlready ? 'bg-yellow-600' : 'bg-red-700'
    }`}>
      <div className="text-6xl mb-4">
        {isSuccess ? '✅' : isAlready ? '⚠️' : '❌'}
      </div>

      {(isSuccess || isAlready) && (
        <>
          <p className="text-2xl font-bold text-white mb-1">
            {'dancerName' in result ? result.dancerName : ''}
          </p>
          {'memberNumber' in result && result.memberNumber && (
            <p className="text-white/70 font-mono text-sm mb-3">{result.memberNumber}</p>
          )}
        </>
      )}

      <p className="text-white font-semibold text-lg">
        {isSuccess && result.status === 'registered' && 'Présence enregistrée'}
        {isSuccess && result.status === 'walk-in' && 'Présence enregistrée (visiteur)'}
        {isAlready && "Déjà pointé aujourd'hui"}
        {isError && ('message' in result ? result.message : 'Erreur')}
      </p>

      {'isTrial' in result && result.isTrial && isSuccess && (
        <span className="mt-3 inline-block text-xs font-semibold bg-white/20 text-white px-3 py-1 rounded-full">
          {"Cours d'essai"}
        </span>
      )}

      <p className="text-white/50 text-xs mt-5">Appuyer pour continuer</p>
    </div>
  );
}
