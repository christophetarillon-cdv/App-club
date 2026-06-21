'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, getDoc, addDoc, updateDoc, doc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useRoles } from '@/hooks/useRoles';
import { useRouter, useParams } from 'next/navigation';
import type { DocumentLibrary, DocumentVersion, DocCategory, DocAccessLevel } from '@cdv/types';

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


function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate?.() ?? new Date(ts.seconds * 1000);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminDocumentDetailPage() {
  const { user } = useAuth();
  const { roles, getLabel } = useRoles();
  const router = useRouter();
  const params = useParams();
  const docId = params.id as string;

  const [document, setDocument] = useState<DocumentLibrary | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit metadata
  const [editMeta, setEditMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({
    title: '', description: '', category: 'administrative' as DocCategory,
    accessLevel: 'members' as DocAccessLevel, allowedRoles: [] as string[],
    tags: '', seasonId: '',
  });
  const [savingMeta, setSavingMeta] = useState(false);

  // New version
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);
  const [newVersionNote, setNewVersionNote] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = async () => {
    const [docSnap, versSnap] = await Promise.all([
      getDoc(doc(db, 'documentLibrary', docId)),
      getDocs(query(collection(db, 'documentLibrary', docId, 'versions'), orderBy('uploadedAt', 'desc'))),
    ]);
    if (!docSnap.exists()) { router.replace('/admin/documents-library'); return; }
    const data = { id: docSnap.id, ...docSnap.data() } as DocumentLibrary;
    setDocument(data);
    setMetaForm({
      title: data.title,
      description: data.description ?? '',
      category: data.category,
      accessLevel: data.accessLevel,
      allowedRoles: data.allowedRoles ?? [],
      tags: data.tags?.join(', ') ?? '',
      seasonId: data.seasonId ?? '',
    });
    setVersions(versSnap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentVersion)));
    setLoading(false);
  };

  useEffect(() => { load(); }, [docId]);

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMeta(true);
    await updateDoc(doc(db, 'documentLibrary', docId), {
      title: metaForm.title.trim(),
      description: metaForm.description.trim() || null,
      category: metaForm.category,
      accessLevel: metaForm.accessLevel,
      allowedRoles: metaForm.accessLevel === 'specific-roles' ? metaForm.allowedRoles : [],
      tags: metaForm.tags.split(',').map(t => t.trim()).filter(Boolean),
      seasonId: metaForm.seasonId || null,
      updatedAt: serverTimestamp(),
    });
    setSavingMeta(false);
    setEditMeta(false);
    await load();
  };

  const handleUploadVersion = async () => {
    if (!user || !newVersionFile) return;
    setUploadingVersion(true); setUploadError(null);

    try {
      const nextNum = `v${versions.length + 1}`;
      const path = `document-library/${docId}/${nextNum}_${Date.now()}_${newVersionFile.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, newVersionFile);

      const fileUrl = await new Promise<string>((resolve, reject) => {
        task.on('state_changed',
          snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          async () => resolve(await getDownloadURL(task.snapshot.ref)),
        );
      });

      // Mark all previous versions as not current
      await Promise.all(versions.filter(v => v.isCurrent).map(v =>
        updateDoc(doc(db, 'documentLibrary', docId, 'versions', v.id), { isCurrent: false })
      ));

      const versionRef = await addDoc(collection(db, 'documentLibrary', docId, 'versions'), {
        versionNumber: nextNum,
        fileUrl,
        fileName: newVersionFile.name,
        mimeType: newVersionFile.type,
        sizeBytes: newVersionFile.size,
        changeNote: newVersionNote.trim() || null,
        uploadedBy: user.uid,
        uploadedAt: serverTimestamp(),
        isCurrent: true,
      });

      await updateDoc(doc(db, 'documentLibrary', docId), {
        currentVersionId: versionRef.id,
        currentVersionNumber: nextNum,
        currentFileUrl: fileUrl,
        currentFileName: newVersionFile.name,
        currentMimeType: newVersionFile.type,
        currentSizeBytes: newVersionFile.size,
        updatedAt: serverTimestamp(),
      });

      setNewVersionFile(null); setNewVersionNote('');
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploadingVersion(false); setUploadProgress(null);
    }
  };

  const handleSetCurrent = async (v: DocumentVersion) => {
    await Promise.all(versions.filter(x => x.isCurrent).map(x =>
      updateDoc(doc(db, 'documentLibrary', docId, 'versions', x.id), { isCurrent: false })
    ));
    await updateDoc(doc(db, 'documentLibrary', docId, 'versions', v.id), { isCurrent: true });
    await updateDoc(doc(db, 'documentLibrary', docId), {
      currentVersionId: v.id,
      currentVersionNumber: v.versionNumber,
      currentFileUrl: v.fileUrl,
      currentFileName: v.fileName,
      currentMimeType: v.mimeType,
      currentSizeBytes: v.sizeBytes,
      updatedAt: serverTimestamp(),
    });
    await load();
  };

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>;
  if (!document) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/admin/documents-library')} className="text-sm text-gray-400 hover:text-gray-700">← Bibliothèque</button>
        <h1 className="text-xl font-bold text-gray-900 truncate">{document.title}</h1>
      </div>

      {/* Métadonnées */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Informations</h2>
          <button onClick={() => setEditMeta(!editMeta)}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium">
            {editMeta ? 'Annuler' : 'Modifier'}
          </button>
        </div>

        {editMeta ? (
          <form onSubmit={handleSaveMeta} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Titre *</label>
                <input value={metaForm.title} onChange={e => setMetaForm(f => ({ ...f, title: e.target.value }))} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={metaForm.description} onChange={e => setMetaForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie</label>
                <select value={metaForm.category} onChange={e => setMetaForm(f => ({ ...f, category: e.target.value as DocCategory }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                  {(Object.keys(CATEGORY_LABELS) as DocCategory[]).map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Accès</label>
                <select value={metaForm.accessLevel} onChange={e => setMetaForm(f => ({ ...f, accessLevel: e.target.value as DocAccessLevel }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                  {(Object.keys(ACCESS_LABELS) as DocAccessLevel[]).map(a => (
                    <option key={a} value={a}>{ACCESS_LABELS[a]}</option>
                  ))}
                </select>
              </div>
              {metaForm.accessLevel === 'specific-roles' && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rôles autorisés</label>
                  <div className="flex flex-wrap gap-3">
                    {roles.map(r => (
                      <label key={r.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" checked={metaForm.allowedRoles.includes(r.key)}
                          onChange={e => setMetaForm(f => ({
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
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Tags (séparés par virgule)</label>
                <input value={metaForm.tags} onChange={e => setMetaForm(f => ({ ...f, tags: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
            </div>
            <button type="submit" disabled={savingMeta}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {savingMeta ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">{CATEGORY_LABELS[document.category]}</span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">{ACCESS_LABELS[document.accessLevel]}</span>
              {!document.isActive && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-medium">Inactif</span>}
            </div>
            {document.description && <p className="text-gray-600">{document.description}</p>}
            {document.tags && document.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {document.tags.map(t => <span key={t} className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">#{t}</span>)}
              </div>
            )}
            <p className="text-gray-400 text-xs">{document.downloadCount} téléchargement{document.downloadCount !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      {/* Versions */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Versions</h2>

        {/* Nouvelle version */}
        <div className="border border-dashed border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <p className="text-xs font-medium text-gray-600">Ajouter une nouvelle version</p>
          <input type="file" onChange={e => setNewVersionFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          <input value={newVersionNote} onChange={e => setNewVersionNote(e.target.value)}
            placeholder="Note de changement (optionnel)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          {uploadProgress !== null && (
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          <button onClick={handleUploadVersion} disabled={!newVersionFile || uploadingVersion}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {uploadingVersion ? 'Upload…' : 'Téléverser'}
          </button>
        </div>

        {/* Liste versions */}
        <div className="space-y-2">
          {versions.map(v => (
            <div key={v.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${v.isCurrent ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{v.versionNumber}</span>
                  {v.isCurrent && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-medium">Actuelle</span>}
                  <span className="text-xs text-gray-400">{formatSize(v.sizeBytes)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{v.fileName}</p>
                {v.changeNote && <p className="text-xs text-gray-400 italic mt-0.5">{v.changeNote}</p>}
                <p className="text-xs text-gray-400">{formatDate(v.uploadedAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={v.fileUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium">
                  Voir
                </a>
                {!v.isCurrent && (
                  <button onClick={() => handleSetCurrent(v)}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
                    Définir actuelle
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
