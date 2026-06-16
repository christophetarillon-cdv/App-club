'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import Link from 'next/link';

type ScanResult =
  | { status: 'registered' | 'walk-in'; isTrial: boolean; dancerName: string; memberNumber: string | null }
  | { status: 'already_registered'; dancerName: string; memberNumber: string | null }
  | { status: 'error'; message: string };

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

  // Charger info kiosque
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'kioskSessions', kioskSessionId), async (snap) => {
      if (!snap.exists() || snap.data()?.status !== 'active') {
        setKioskActive(false);
        return;
      }
      const courseId = snap.data()?.courseId as string;
      if (courseId) {
        const { getDoc } = await import('firebase/firestore');
        const courseSnap = await getDoc(doc(db, 'courses', courseId));
        if (courseSnap.exists()) setCourseName(courseSnap.data()?.name ?? '');
      }
    });
    return () => unsub();
  }, [kioskSessionId]);

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

  // Ref stable vers handleScan pour éviter de redémarrer la caméra à chaque scan
  const handleScanRef = useRef(handleScan);
  useEffect(() => { handleScanRef.current = handleScan; }, [handleScan]);

  // Initialiser le scanner de QR code
  useEffect(() => {
    if (!kioskActive || !videoRef.current) return;
    let reader: any;
    let stopped = false;
    let localStream: MediaStream | null = null;

    const start = async () => {
      try {
        // On gère le stream nous-mêmes pour en garder la référence
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        localStream = stream;

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
  }, [kioskActive]);

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
        ) : (
          <>
            <video
              ref={videoRef}
              className={`w-full max-w-sm rounded-2xl object-cover aspect-square bg-black ${scanResult ? 'opacity-30' : 'opacity-100'} transition-opacity`}
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
      {!scanResult && !processing && (
        <div className="py-6 text-center">
          <p className="text-gray-500 text-sm">Présentez votre QR code devant la caméra</p>
        </div>
      )}
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
