'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

interface Course { id: string; name: string; seasonId: string; }

const registerMediaFn = httpsCallable<object, { id: string }>(functions, 'registerMedia');

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export default function InstructorAddMediaPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'audio' | 'video'>('audio');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'courses', courseId)).then(snap => {
      if (snap.exists()) setCourse({ id: snap.id, name: snap.data().name ?? '', seasonId: snap.data().seasonId ?? '' });
    });
  }, [courseId]);

  const handleUpload = async () => {
    if (!user || !file || !title.trim()) return;
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
        const el = document.createElement(type === 'video' ? 'video' : 'audio');
        await new Promise<void>(res => {
          el.onloadedmetadata = () => { durationSeconds = Math.round(el.duration); res(); };
          el.onerror = () => res();
          el.src = url;
        });
        URL.revokeObjectURL(url);
      } catch { /* non bloquant */ }

      await registerMediaFn({
        storagePath: path,
        sourceUrl,
        title: title.trim(),
        description: description.trim() || null,
        type,
        seasonId: course?.seasonId || null,
        attachedTo: `course:${courseId}`,
        mimeType: file.type,
        sizeBytes: file.size,
        durationSeconds,
        isPublic: false,
      });

      setDone(true);
      setTimeout(() => router.push('/instructor'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  if (done) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">✅</div>
        <p className="text-gray-700 font-semibold">Média enregistré !</p>
        <p className="text-gray-400 text-sm mt-1">Redirection…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/instructor" className="text-sm text-gray-400 hover:text-gray-700">← Mes séances</Link>
        <h1 className="text-xl font-bold text-gray-900">Ajouter un média</h1>
      </div>

      {course && (
        <div className="bg-blue-50 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-blue-700 font-medium">Cours : {course.name}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4 max-w-lg">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Titre *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select value={type} onChange={e => setType(e.target.value as 'audio' | 'video')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            <option value="audio">Audio</option>
            <option value="video">Vidéo</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Fichier *</label>
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {file && <p className="text-xs text-gray-400 mt-1">{file.name} · {formatSize(file.size)}</p>}
        </div>

        {progress !== null && (
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleUpload}
          disabled={uploading || !file || !title.trim()}
          className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"
        >
          {uploading ? `Upload… ${progress ?? 0}%` : 'Enregistrer le média'}
        </button>
      </div>
    </div>
  );
}
