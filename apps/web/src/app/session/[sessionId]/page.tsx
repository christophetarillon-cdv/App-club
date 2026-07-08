'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { AppShell } from '@/components/AppShell';
import type { Media } from '@cdv/types';

const DAY_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_FR[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]} ${d.getFullYear()}`;
}

interface SessionData {
  id: string; courseId: string; date: string; startTime: string; endTime: string;
  status: string; programNote?: string;
}
interface CourseData { id: string; name: string; danceStyleId: string; levelId: string; roomId: string; seasonId: string; }

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { selectedDancer } = useDancer();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [course, setCourse] = useState<CourseData | null>(null);
  const [styleName, setStyleName] = useState('');
  const [styleColor, setStyleColor] = useState('#6B7280');
  const [levelName, setLevelName] = useState('');
  const [roomName, setRoomName] = useState('');

  const [uploadRoles, setUploadRoles] = useState<string[]>([]);
  const [viewRoles, setViewRoles] = useState<string[]>([]);
  const [noteViewRoles, setNoteViewRoles] = useState<string[]>([]);
  const [noteEditRoles, setNoteEditRoles] = useState<string[]>([]);

  const [videos, setVideos] = useState<Media[]>([]);
  const [noteText, setNoteText] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rôles du danseur ACTIF (celui sélectionné dans l'app), pas de tous les
  // danseurs du compte — sur un compte famille, un autre danseur (ex:
  // moniteur) ne doit pas donner ses droits au danseur actuellement affiché.
  const callerRoles = useMemo(() => selectedDancer?.roles ?? [], [selectedDancer]);
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
          setStyleColor(styleSnap.data().color ?? '#6B7280');
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

  const handleUpload = async () => {
    if (!file || !title.trim() || !session || !user) return;
    setUploading(true); setError(null);
    try {
      const path = `media/${crypto.randomUUID()}/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);

      const sourceUrl = await new Promise<string>((resolve, reject) => {
        task.on('state_changed',
          snap => setProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          async () => resolve(await getDownloadURL(task.snapshot.ref)),
        );
      });

      let durationSeconds: number | undefined;
      try {
        const url = URL.createObjectURL(file);
        const el = document.createElement('video');
        await new Promise<void>(res => {
          el.onloadedmetadata = () => { durationSeconds = Math.round(el.duration); res(); };
          el.onerror = () => res();
          el.src = url;
        });
        URL.revokeObjectURL(url);
      } catch { /* non bloquant */ }

      const registerMedia = httpsCallable(functions, 'registerMedia');
      await registerMedia({
        storagePath: path,
        sourceUrl,
        title: title.trim(),
        description: null,
        type: 'video',
        seasonId: course?.seasonId || null,
        attachedTo: `session:${session.id}`,
        actingDancerId: selectedDancer?.id || null,
        mimeType: file.type,
        sizeBytes: file.size,
        durationSeconds,
        isPublic: false,
      });

      setTitle(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  if (loading) {
    return <AppShell><div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-400 text-sm">Chargement…</div></AppShell>;
  }
  if (!session) {
    return <AppShell><div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-400 text-sm">Séance introuvable.</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="relative overflow-hidden pb-8" style={{
        background: 'linear-gradient(180deg, #2F86C0 0%, #2F86C0 45%, #7FBFE3 70%, #D8EAF3 88%, #F9F7F4 100%)',
      }}>
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <button onClick={() => router.back()} className="text-sm text-white/80 hover:text-white mb-2">← Retour</button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-extrabold text-white">{course?.name ?? '—'}</h1>
            {styleName && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/25 text-white">
                {styleName}
              </span>
            )}
          </div>
          <p className="text-sm text-white/80 mt-1">
            {formatDate(session.date)} · {session.startTime}–{session.endTime}
            {levelName ? ` · ${levelName}` : ''}{roomName ? ` · ${roomName}` : ''}
          </p>
          {session.status === 'cancelled' && (
            <span className="inline-block mt-2 text-xs font-semibold text-white bg-red-500/80 rounded-full px-2.5 py-0.5">
              Séance annulée
            </span>
          )}
        </div>
        <svg className="absolute bottom-0 left-0 w-full h-8 text-background" viewBox="0 0 400 44" preserveAspectRatio="none" fill="currentColor">
          <path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" />
        </svg>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-5 -mt-4 relative">

        {/* Programme */}
        {canViewNote && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Programme</h2>
          {editingNote ? (
            <>
              <textarea
                value={noteText} onChange={e => setNoteText(e.target.value)} rows={4}
                placeholder="Programme de la séance…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => { setEditingNote(false); setNoteText(session.programNote ?? ''); }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Annuler</button>
                <button onClick={handleSaveNote} disabled={savingNote}
                  className="bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-1.5 hover:bg-blue-700 disabled:opacity-50">
                  {savingNote ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </>
          ) : (
            <div
              onClick={() => canEditNote && setEditingNote(true)}
              className={`text-sm ${canEditNote ? 'cursor-pointer hover:bg-gray-50' : ''} rounded-lg px-3 py-2 -mx-3`}
            >
              {session.programNote ? (
                <p className="text-gray-700 whitespace-pre-wrap">{session.programNote}</p>
              ) : (
                <p className="text-gray-400 italic">{canEditNote ? 'Ajouter un programme…' : 'Aucun programme renseigné.'}</p>
              )}
            </div>
          )}
        </div>
        )}

        {/* Vidéo */}
        {canViewVideo && videos.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Vidéo</h2>
            {videos.map(v => (
              <div key={v.id}>
                <p className="text-sm font-medium text-gray-800 mb-1.5">{v.title}</p>
                <video controls crossOrigin="anonymous" src={v.sourceUrl} className="w-full rounded-xl" style={{ maxHeight: 320 }} />
              </div>
            ))}
          </div>
        )}

        {canUploadVideo && videos.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Ajouter une vidéo</h2>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de la vidéo"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            <input
              ref={fileRef} type="file" accept="video/*"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {progress !== null && (
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={handleUpload} disabled={uploading || !file || !title.trim()}
              className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
              {uploading ? `Envoi… ${progress ?? 0}%` : 'Envoyer la vidéo'}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
