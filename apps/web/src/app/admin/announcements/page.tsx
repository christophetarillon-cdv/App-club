'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { Announcement } from '@cdv/types';

export default function AnnouncementsPage() {
  const { user, account, dancers } = useAuth();
  const userRoles = [...(account?.roles ?? []), ...dancers.flatMap(d => d.roles)];
  const isAdmin = userRoles.includes('admin');

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    const snap = await getDocs(query(collection(db, 'announcements'), orderBy('sentAt', 'desc')));
    setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !user) return;
    setSaving(true);
    await addDoc(collection(db, 'announcements'), {
      title: title.trim(),
      body: body.trim(),
      sentAt: serverTimestamp(),
      sentBy: user.uid,
      channelId: '',
      recipientCount: 0,
    });
    setTitle('');
    setBody('');
    setSaving(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'announcements', id));
    setConfirmDelete(null);
    load();
  };

  if (!isAdmin) return <div className="p-8 text-gray-500">Accès réservé aux administrateurs.</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-gray-900">Actualités</h1>

      {/* Formulaire de création */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Publier une actualité</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Titre</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Titre de l'actualité"
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Contenu</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Texte de l'actualité…"
              maxLength={500}
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{body.length}/500</p>
          </div>
          <button
            type="submit"
            disabled={saving || !title.trim() || !body.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Publication…' : 'Publier'}
          </button>
        </form>
      </div>

      {/* Liste */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Actualités publiées</h2>
        </div>

        {loading ? (
          <p className="px-6 py-8 text-sm text-gray-400">Chargement…</p>
        ) : announcements.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-400 text-center">Aucune actualité pour le moment.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {announcements.map(a => {
              const date = a.sentAt
                ? new Date((a.sentAt as any).seconds * 1000).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })
                : '—';

              return (
                <li key={a.id} className="px-6 py-4 flex gap-4 items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-wrap">{a.body}</p>
                    <p className="text-xs text-gray-400 mt-1">{date}</p>
                  </div>

                  {confirmDelete === a.id ? (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="text-xs px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700"
                      >
                        Confirmer
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(a.id)}
                      className="shrink-0 text-xs text-red-500 hover:text-red-700"
                    >
                      Supprimer
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
