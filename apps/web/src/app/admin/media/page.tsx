'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import type { Media } from '@cdv/types';

interface Season { id: string; label: string; isActive: boolean; }
interface Course { id: string; name: string; danceStyleId: string; }
interface DanceStyle { id: string; name: string; color?: string; }

const registerMediaFn = httpsCallable<object, { id: string }>(functions, 'registerMedia');

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function formatDuration(secs?: number) {
  if (!secs) return null;
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AdminMediaPage() {
  const { user } = useAuth();

  const [media, setMedia] = useState<Media[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [styles, setStyles] = useState<DanceStyle[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState<'' | 'audio' | 'video'>('');
  const [filterSeason, setFilterSeason] = useState('');   // '' | 'intemporel' | seasonId
  const [filterCourse, setFilterCourse] = useState('');

  // Upload form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', type: 'audio' as 'audio' | 'video',
    seasonId: '', attachedTo: '', isPublic: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Expanded player
  const [expanded, setExpanded] = useState<string | null>(null);
  const [speeds, setSpeeds] = useState<Map<string, number>>(new Map());
  const mediaEls = useRef<Map<string, HTMLAudioElement | HTMLVideoElement>>(new Map());

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'media'), orderBy('uploadedAt', 'desc'))),
      getDocs(collection(db, 'seasons')),
      getDocs(collection(db, 'courses')),
      getDocs(collection(db, 'danceStyles')),
    ]).then(([mediaSnap, seasonSnap, courseSnap, styleSnap]) => {
      setMedia(mediaSnap.docs.map(d => ({ id: d.id, ...d.data() } as Media)));
      setSeasons(seasonSnap.docs.map(d => ({
        id: d.id, label: d.data().label ?? d.id, isActive: d.data().isActive === true,
      })).sort((a, b) => (b.label > a.label ? 1 : -1)));
      setCourses(courseSnap.docs.map(d => ({
        id: d.id, name: d.data().name ?? '', danceStyleId: d.data().danceStyleId ?? '',
      })).sort((a, b) => a.name.localeCompare(b.name, 'fr')));
      setStyles(styleSnap.docs.map(d => ({
        id: d.id, name: d.data().name ?? '', color: d.data().color,
      })));
    }).finally(() => setLoading(false));
  }, []);

  const filtered = media.filter(m => {
    if (filterType && m.type !== filterType) return false;
    if (filterSeason === 'intemporel' && m.seasonId) return false;
    if (filterSeason && filterSeason !== 'intemporel' && m.seasonId !== filterSeason) return false;
    if (filterCourse && m.courseId !== filterCourse) return false;
    return true;
  });

  const handleUpload = async () => {
    if (!user || !file || !form.title.trim()) return;
    setUploading(true); setUploadError(null);

    try {
      const ext = file.name.split('.').pop() ?? '';
      const uuid = crypto.randomUUID();
      const path = `media/${uuid}/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);

      const sourceUrl = await new Promise<string>((resolve, reject) => {
        task.on('state_changed',
          snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          async () => resolve(await getDownloadURL(task.snapshot.ref)),
        );
      });

      // Durée auto depuis l'élément media si possible
      let durationSeconds: number | undefined;
      try {
        const url = URL.createObjectURL(file);
        const el = document.createElement(form.type === 'video' ? 'video' : 'audio');
        await new Promise<void>(res => {
          el.onloadedmetadata = () => { durationSeconds = Math.round(el.duration); res(); };
          el.onerror = () => res();
          el.src = url;
        });
        URL.revokeObjectURL(url);
      } catch { /* non bloquant */ }

      const result = await registerMediaFn({
        storagePath: path,
        sourceUrl,
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        seasonId: form.seasonId || null,
        attachedTo: form.attachedTo || null,
        mimeType: file.type || `${form.type}/${ext}`,
        sizeBytes: file.size,
        durationSeconds,
        isPublic: form.isPublic,
      });

      const newDoc: Media = {
        id: result.data.id,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        seasonId: form.seasonId || null,
        storageProvider: 'firebase',
        storagePath: path,
        sourceUrl,
        uploadedBy: user.uid,
        attachedTo: form.attachedTo || null,
        courseId: form.attachedTo?.startsWith('course:') ? form.attachedTo.replace('course:', '') : null,
        mimeType: file.type,
        sizeBytes: file.size,
        durationSeconds,
        isPublic: form.isPublic,
        uploadedAt: { seconds: Date.now() / 1000, nanoseconds: 0, toDate: () => new Date(), toMillis: () => Date.now() },
      };
      setMedia(prev => [newDoc, ...prev]);
      setForm({ title: '', description: '', type: 'audio', seasonId: '', attachedTo: '', isPublic: false });
      setFile(null);
      setShowForm(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = async (m: Media) => {
    if (!confirm(`Supprimer "${m.title}" ?`)) return;
    await deleteDoc(doc(db, 'media', m.id));
    if (m.storagePath) {
      try { await deleteObject(storageRef(storage, m.storagePath)); } catch { /* déjà supprimé */ }
    }
    setMedia(prev => prev.filter(x => x.id !== m.id));
  };

  const seasonLabel = (id: string | null | undefined) => {
    if (!id) return 'Intemporel';
    return seasons.find(s => s.id === id)?.label ?? id;
  };
  const courseLabel = (id: string | null | undefined) => {
    if (!id) return null;
    return courses.find(c => c.id === id)?.name ?? id;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/courses" className="text-sm text-gray-400 hover:text-gray-700">← Admin</Link>
          <h1 className="text-2xl font-bold text-gray-900">Médiathèque</h1>
          {!loading && <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">{media.length}</span>}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Annuler' : '+ Ajouter un média'}
        </button>
      </div>

      {/* Formulaire upload */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Nouveau média</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Titre *</label>
              <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as 'audio' | 'video' }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                <option value="audio">Audio</option>
                <option value="video">Vidéo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Saison</label>
              <select value={form.seasonId} onChange={e => setForm(p => ({ ...p, seasonId: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                <option value="">Intemporel</option>
                {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rattachement cours</label>
              <select value={form.attachedTo} onChange={e => setForm(p => ({ ...p, attachedTo: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                <option value="">Général (club)</option>
                {courses.map(c => <option key={c.id} value={`course:${c.id}`}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="isPublic" checked={form.isPublic}
                onChange={e => setForm(p => ({ ...p, isPublic: e.target.checked }))}
                className="rounded border-gray-300" />
              <label htmlFor="isPublic" className="text-sm text-gray-700">Public (sans connexion)</label>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Fichier *</label>
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {file && <p className="text-xs text-gray-400 mt-1">{file.name} · {formatSize(file.size)}</p>}
            </div>
          </div>

          {uploadProgress !== null && (
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}

          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

          <button
            onClick={handleUpload}
            disabled={uploading || !file || !form.title.trim()}
            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"
          >
            {uploading ? `Upload en cours… ${uploadProgress ?? 0}%` : 'Enregistrer le média'}
          </button>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={filterType} onChange={e => setFilterType(e.target.value as '' | 'audio' | 'video')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
          <option value="">Tous types</option>
          <option value="audio">Audio</option>
          <option value="video">Vidéo</option>
        </select>
        <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
          <option value="">Toutes saisons</option>
          <option value="intemporel">Intemporel</option>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
          <option value="">Tous cours</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-sm text-gray-400 self-center">{filtered.length} média(s)</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
          <p className="text-gray-500 font-medium">Aucun média.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => (
            <div key={m.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${m.type === 'audio' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                  {m.type === 'audio' ? (
                    <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{m.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.type === 'audio' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {m.type === 'audio' ? 'Audio' : 'Vidéo'}
                    </span>
                    <span className="text-xs text-gray-400">{seasonLabel(m.seasonId)}</span>
                    {courseLabel(m.courseId) && <span className="text-xs text-gray-400">· {courseLabel(m.courseId)}</span>}
                    {m.durationSeconds && <span className="text-xs text-gray-400">· {formatDuration(m.durationSeconds)}</span>}
                    <span className="text-xs text-gray-300">{formatSize(m.sizeBytes)}</span>
                    {(m.encodingStatus === 'pending' || m.encodingStatus === 'encoding') && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700 animate-pulse">
                        {m.encodingStatus === 'encoding' ? 'Encodage…' : 'En attente'}
                      </span>
                    )}
                    {m.encodingStatus === 'error' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Erreur encodage</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    disabled={m.encodingStatus === 'pending' || m.encodingStatus === 'encoding'}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {expanded === m.id ? 'Fermer' : 'Écouter'}
                  </button>
                  <button
                    onClick={() => handleDelete(m)}
                    className="text-xs font-medium text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              {expanded === m.id && (
                <div className="px-5 pb-5 border-t border-gray-50 pt-4">
                  {m.description && <p className="text-sm text-gray-600 mb-3">{m.description}</p>}
                  {m.type === 'audio' ? (
                    <audio controls crossOrigin="anonymous" src={m.sourceUrl} className="w-full"
                      ref={el => { if (el) mediaEls.current.set(m.id, el); else mediaEls.current.delete(m.id); }} />
                  ) : (
                    <video controls crossOrigin="anonymous" src={m.sourceUrl} className="w-full rounded-xl max-h-64"
                      ref={el => { if (el) mediaEls.current.set(m.id, el); else mediaEls.current.delete(m.id); }} />
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-xs text-gray-500 shrink-0">Vitesse</span>
                    <input type="range" min="0.5" max="2" step="0.01"
                      value={speeds.get(m.id) ?? 1}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setSpeeds(prev => new Map(prev).set(m.id, val));
                        const el = mediaEls.current.get(m.id);
                        if (el) {
                          el.playbackRate = val;
                          (el as any).preservesPitch = true;
                          (el as any).webkitPreservesPitch = true;
                        }
                      }}
                      className="flex-1 accent-blue-600" />
                    <span className="text-xs text-gray-400 w-10 text-right">{Math.round((speeds.get(m.id) ?? 1) * 100)}%</span>
                    {(speeds.get(m.id) ?? 1) !== 1 && (
                      <button onClick={() => {
                        setSpeeds(prev => { const n = new Map(prev); n.delete(m.id); return n; });
                        const el = mediaEls.current.get(m.id);
                        if (el) el.playbackRate = 1;
                      }} className="text-xs text-gray-400 hover:text-gray-600">↺</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
