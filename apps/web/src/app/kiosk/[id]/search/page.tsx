'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, query, where, orderBy, getDocs, limit, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import type { Dancer } from '@cdv/types';
import Link from 'next/link';

type ScanResult =
  | { status: 'registered' | 'walk-in'; isTrial: boolean; dancerName: string; memberNumber: string | null }
  | { status: 'already_registered'; dancerName: string; memberNumber: string | null }
  | { status: 'error'; message: string };

const recordAttendanceFn = httpsCallable<
  { qrUid?: string; dancerId?: string; kioskSessionId: string },
  ScanResult
>(functions, 'recordAttendance');

export default function KioskSearchPage() {
  const { id: kioskSessionId } = useParams<{ id: string }>();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Dancer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Dancer | null>(null);
  const [recording, setRecording] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [courseName, setCourseName] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [sessionTime, setSessionTime] = useState('');
  const [danceStyle, setDanceStyle] = useState('');
  const [level, setLevel] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const load = async () => {
      const { getDoc, onSnapshot } = await import('firebase/firestore');
      const unsub = onSnapshot(doc(db, 'kioskSessions', kioskSessionId), async (snap) => {
        if (!snap.exists() || snap.data()?.status !== 'active') return;
        const { sessionId, courseId } = snap.data() as { sessionId: string; courseId: string };

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
      return unsub;
    };
    let cleanup: (() => void) | undefined;
    load().then(unsub => { cleanup = unsub; });
    return () => { cleanup?.(); };
  }, [kioskSessionId]);

  useEffect(() => {
    const trimmed = search.trim().toLowerCase();
    if (trimmed.length < 2) { setResults([]); return; }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const [byFirst, byLast] = await Promise.all([
          getDocs(query(
            collection(db, 'dancers'),
            where('firstNameLower', '>=', trimmed),
            where('firstNameLower', '<=', trimmed + ''),
            orderBy('firstNameLower'),
            limit(20),
          )),
          getDocs(query(
            collection(db, 'dancers'),
            where('lastNameLower', '>=', trimmed),
            where('lastNameLower', '<=', trimmed + ''),
            orderBy('lastNameLower'),
            limit(20),
          )),
        ]);
        const seen = new Set<string>();
        const merged: Dancer[] = [];
        [...byFirst.docs, ...byLast.docs].forEach(d => {
          const data = d.data();
          if (!seen.has(d.id) && data.isActive !== false) {
            seen.add(d.id);
            merged.push({ id: d.id, ...data } as Dancer);
          }
        });
        merged.sort((a, b) => a.lastName.localeCompare(b.lastName));
        setResults(merged);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const handleRecord = async (dancer: Dancer) => {
    setSelected(dancer);
    setRecording(true);
    setScanResult(null);
    try {
      const res = await recordAttendanceFn({ dancerId: dancer.id, kioskSessionId });
      setScanResult(res.data);
    } catch (err: any) {
      setScanResult({ status: 'error', message: err?.message ?? 'Erreur inconnue' });
    } finally {
      setRecording(false);
    }
  };

  const handleReset = () => {
    setScanResult(null);
    setSelected(null);
    setSearch('');
    setResults([]);
    inputRef.current?.focus();
  };

  if (scanResult) {
    const isSuccess = scanResult.status === 'registered' || scanResult.status === 'walk-in';
    const isAlready = scanResult.status === 'already_registered';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className={`w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl ${
          isSuccess ? 'bg-green-600' : isAlready ? 'bg-yellow-600' : 'bg-red-700'
        }`}>
          <div className="text-6xl mb-4">{isSuccess ? '✅' : isAlready ? '⚠️' : '❌'}</div>
          {'dancerName' in scanResult && (
            <p className="text-2xl font-bold text-white mb-1">{scanResult.dancerName}</p>
          )}
          {'memberNumber' in scanResult && scanResult.memberNumber && (
            <p className="text-white/70 font-mono text-sm mb-3">{scanResult.memberNumber}</p>
          )}
          <p className="text-white font-semibold text-lg">
            {isSuccess && scanResult.status === 'registered' && 'Présence enregistrée'}
            {isSuccess && scanResult.status === 'walk-in' && 'Présence enregistrée (visiteur)'}
            {isAlready && 'Déjà pointé aujourd\'hui'}
            {'message' in scanResult && scanResult.message}
          </p>
          {'isTrial' in scanResult && scanResult.isTrial && isSuccess && (
            <span className="mt-3 inline-block text-xs font-semibold bg-white/20 text-white px-3 py-1 rounded-full">
              Cours d'essai
            </span>
          )}
        </div>
        <div className="flex gap-4 mt-6">
          <button onClick={handleReset}
            className="px-6 py-3 bg-gray-700 rounded-xl font-medium hover:bg-gray-600">
            Nouvelle recherche
          </button>
          <Link href={`/kiosk/${kioskSessionId}/scan`}
            className="px-6 py-3 bg-blue-600 rounded-xl font-medium hover:bg-blue-700">
            Retour scan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gray-800 border-b border-gray-700">
        <Link href={`/kiosk/${kioskSessionId}/scan`} className="flex items-center gap-2 text-gray-400 hover:text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Scan QR
        </Link>
        <h1 className="font-semibold text-white">Recherche manuelle</h1>
        <div className="w-16" />
      </div>

      {/* Infos séance */}
      <div className="text-center px-6 pt-5 pb-3 bg-gray-900">
        {sessionDate && <p className="text-3xl font-bold text-white">{sessionDate}</p>}
        <p className="text-2xl font-semibold text-white mt-1">{courseName || '…'}</p>
        <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
          {danceStyle && <p className="text-xl text-blue-300 font-medium">{danceStyle}</p>}
          {danceStyle && level && <span className="text-gray-500">·</span>}
          {level && <p className="text-xl text-blue-300 font-medium">{level}</p>}
          {sessionTime && <span className="text-gray-500">·</span>}
          {sessionTime && <p className="text-xl text-gray-300">{sessionTime}</p>}
        </div>
      </div>

      {/* Champ de recherche */}
      <div className="p-4 bg-gray-800 border-b border-gray-700">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Prénom ou nom…"
          className="w-full bg-gray-700 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoComplete="off"
        />
      </div>

      {/* Résultats */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {searching && (
          <p className="text-center text-gray-500 py-8">Recherche…</p>
        )}

        {!searching && search.trim().length >= 2 && results.length === 0 && (
          <p className="text-center text-gray-500 py-8">Aucun danseur trouvé</p>
        )}

        {!searching && results.map(dancer => (
          <button
            key={dancer.id}
            onClick={() => handleRecord(dancer)}
            disabled={recording}
            className="w-full flex items-center gap-4 px-4 py-3 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-blue-800 flex items-center justify-center text-blue-200 font-bold text-sm shrink-0">
              {dancer.firstName[0]}{dancer.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">{dancer.firstName} {dancer.lastName}</p>
              {dancer.memberNumber && (
                <p className="text-sm text-gray-400 font-mono">{dancer.memberNumber}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              {dancer.roles.map(r => (
                <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  r === 'trial' ? 'bg-orange-800/60 text-orange-300' : 'bg-blue-800/60 text-blue-300'
                }`}>
                  {r === 'member' ? 'Membre' : r === 'trial' ? 'Essai' : r === 'instructor' ? 'Moniteur' : r}
                </span>
              ))}
            </div>
            {recording && selected?.id === dancer.id && (
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
            )}
          </button>
        ))}

        {search.trim().length < 2 && (
          <p className="text-center text-gray-600 py-12 text-sm">
            Tapez au moins 2 caractères pour chercher
          </p>
        )}
      </div>
    </div>
  );
}
