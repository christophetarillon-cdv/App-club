'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useRoles } from '@/hooks/useRoles';
import Link from 'next/link';
import type { DocumentLibrary, DocCategory, DocAccessLevel } from '@cdv/types';

const CATEGORY_LABELS: Record<DocCategory, string> = {
  administrative: 'Administratif',
  practical: 'Pratique',
  pedagogical: 'Pédagogique',
  events: 'Événements',
  other: 'Autre',
};

const ACCESS_LABELS: Record<DocAccessLevel, string> = {
  public: 'Public',
  members: 'Membres',
  'paid-members': 'Membres à jour',
  'specific-roles': 'Rôles spécifiques',
};


const emptyForm = {
  title: '', description: '', category: 'administrative' as DocCategory,
  accessLevel: 'members' as DocAccessLevel, allowedRoles: [] as string[],
  tags: '', seasonId: '',
};

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function AdminDocumentsLibraryPage() {
  const { user } = useAuth();
  const { roles, getLabel } = useRoles();
  const [documents, setDocuments] = useState<DocumentLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const snap = await getDocs(query(collection(db, 'documentLibrary'), orderBy('category', 'asc')));
    setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentLibrary)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleToggleActive = async (d: DocumentLibrary) => {
    await updateDoc(doc(db, 'documentLibrary', d.id), { isActive: !d.isActive, updatedAt: serverTimestamp() });
    setDocuments(prev => prev.map(x => x.id === d.id ? { ...x, isActive: !x.isActive } : x));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !file || !form.title.trim()) return;
    setSaving(true); setError(null);

    try {
      const docRef = await addDoc(collection(db, 'documentLibrary'), {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        accessLevel: form.accessLevel,
        allowedRoles: form.accessLevel === 'specific-roles' ? form.allowedRoles : [],
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        seasonId: form.seasonId || null,
        downloadCount: 0,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
      });

      const path = `document-library/${docRef.id}/v1_${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);

      const fileUrl = await new Promise<string>((resolve, reject) => {
        task.on('state_changed',
          snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          async () => resolve(await getDownloadURL(task.snapshot.ref)),
        );
      });

      const versionRef = await addDoc(collection(db, 'documentLibrary', docRef.id, 'versions'), {
        versionNumber: 'v1',
        fileUrl,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedBy: user.uid,
        uploadedAt: serverTimestamp(),
        isCurrent: true,
      });

      await updateDoc(docRef, {
        currentVersionId: versionRef.id,
        currentVersionNumber: 'v1',
        currentFileUrl: fileUrl,
        currentFileName: file.name,
        currentMimeType: file.type,
        currentSizeBytes: file.size,
      });

      setForm(emptyForm); setFile(null); setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false); setUploadProgress(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Bibliothèque de documents</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + Nouveau document
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Nouveau document</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Titre *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as DocCategory }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                {(Object.keys(CATEGORY_LABELS) as DocCategory[]).map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Accès</label>
              <select value={form.accessLevel} onChange={e => setForm(f => ({ ...f, accessLevel: e.target.value as DocAccessLevel }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                {(Object.keys(ACCESS_LABELS) as DocAccessLevel[]).map(a => (
                  <option key={a} value={a}>{ACCESS_LABELS[a]}</option>
                ))}
              </select>
            </div>
            {form.accessLevel === 'specific-roles' && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Rôles autorisés</label>
                <div className="flex flex-wrap gap-3">
                  {roles.map(r => (
                    <label key={r.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.allowedRoles.includes(r.key)}
                        onChange={e => setForm(f => ({
                          ...f, allowedRoles: e.target.checked
                            ? [...f.allowedRoles, r.key]
                            : f.allowedRoles.filter(x => x !== r.key),
                        }))} className="rounded" />
                      {r.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tags (séparés par virgule)</label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="ex: règlement, inscription"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fichier *</label>
              <input type="file" required onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              {file && <p className="text-xs text-gray-400 mt-1">{file.name} — {formatSize(file.size)}</p>}
            </div>
          </div>

          {uploadProgress !== null && (
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={saving || !file || !form.title.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {saving ? 'Envoi…' : 'Créer'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm); setFile(null); setError(null); }}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">
              Annuler
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">Chargement…</p>
      ) : documents.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-12">Aucun document.</p>
      ) : (
        <div className="space-y-2">
          {documents.map(d => (
            <div key={d.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900">{d.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{CATEGORY_LABELS[d.category]}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ACCESS_LABELS[d.accessLevel]}</span>
                  {!d.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">Inactif</span>}
                </div>
                {d.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{d.description}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  {d.currentVersionNumber && <span>{d.currentVersionNumber}</span>}
                  {d.currentSizeBytes && <span>{formatSize(d.currentSizeBytes)}</span>}
                  <span>{d.downloadCount} téléchargement{d.downloadCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => handleToggleActive(d)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${d.isActive ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                  {d.isActive ? 'Désactiver' : 'Activer'}
                </button>
                <Link href={`/admin/documents-library/${d.id}`}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-blue-50 text-blue-700 hover:bg-blue-100">
                  Gérer
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
