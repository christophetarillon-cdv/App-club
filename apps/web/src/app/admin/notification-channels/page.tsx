'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import type { NotificationChannel, NotificationChannelType } from '@cdv/types';

interface Course { id: string; name: string; }
interface Style { id: string; name: string; }

const TYPE_LABELS: Record<NotificationChannelType, string> = {
  main: 'Tous les membres',
  course: 'Cours spécifique',
  style: 'Style de danse',
  custom: 'Liste personnalisée',
};

export default function NotificationChannelsPage() {
  const { user, account, dancers } = useAuth();
  const userRoles = [...(account?.roles ?? []), ...dancers.flatMap(d => d.roles)];
  const isAdmin = userRoles.includes('admin');

  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<NotificationChannelType>('main');
  const [formTargetId, setFormTargetId] = useState('');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getDocs(query(collection(db, 'notificationChannels'), orderBy('createdAt', 'desc'))),
      getDocs(collection(db, 'courses')),
      getDocs(collection(db, 'danceStyles')),
    ]).then(([channelSnap, courseSnap, styleSnap]) => {
      setChannels(channelSnap.docs.map(d => ({ id: d.id, ...d.data() } as NotificationChannel)));
      setCourses(courseSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? d.id })));
      setStyles(styleSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? d.id })));
    }).finally(() => setLoading(false));
  }, [user]);

  const handleToggle = async (ch: NotificationChannel) => {
    await updateDoc(doc(db, 'notificationChannels', ch.id), { isActive: !ch.isActive });
    setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, isActive: !c.isActive } : c));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce canal ?')) return;
    setDeletingId(id);
    await deleteDoc(doc(db, 'notificationChannels', id));
    setChannels(prev => prev.filter(c => c.id !== id));
    setDeletingId(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const data: any = {
        name: formName.trim(),
        type: formType,
        isActive: true,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      };
      if ((formType === 'course' || formType === 'style') && formTargetId) {
        data.targetId = formTargetId;
      }
      const ref = await addDoc(collection(db, 'notificationChannels'), data);
      setChannels(prev => [{ id: ref.id, ...data } as NotificationChannel, ...prev]);
      setShowForm(false);
      setFormName(''); setFormType('main'); setFormTargetId('');
    } finally {
      setSaving(false);
    }
  };

  const targetLabel = (ch: NotificationChannel) => {
    if (ch.type === 'course') return courses.find(c => c.id === ch.targetId)?.name ?? ch.targetId ?? '—';
    if (ch.type === 'style') return styles.find(s => s.id === ch.targetId)?.name ?? ch.targetId ?? '—';
    return null;
  };

  if (!isAdmin) return <div className="p-8 text-gray-500">Accès réservé aux administrateurs.</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile" className="text-sm text-gray-400 hover:text-gray-700">← Profil</Link>
          <h1 className="text-2xl font-bold text-gray-900">Canaux de notification</h1>
        </div>

        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-gray-500">{channels.length} canal{channels.length !== 1 ? 'x' : ''}</p>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
            + Nouveau canal
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Nouveau canal</h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nom du canal</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} required
                placeholder="ex. Annonces générales"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type de destinataires</label>
              <select value={formType} onChange={e => { setFormType(e.target.value as NotificationChannelType); setFormTargetId(''); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white">
                {(Object.entries(TYPE_LABELS) as [NotificationChannelType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {formType === 'course' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cours</label>
                <select value={formTargetId} onChange={e => setFormTargetId(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white">
                  <option value="">Choisir un cours</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {formType === 'style' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Style de danse</label>
                <select value={formTargetId} onChange={e => setFormTargetId(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white">
                  <option value="">Choisir un style</option>
                  {styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Création…' : 'Créer'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : channels.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-500">Aucun canal. Créez-en un pour commencer.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map(ch => (
              <div key={ch.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{ch.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {TYPE_LABELS[ch.type]}
                    </span>
                    {targetLabel(ch) && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {targetLabel(ch)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(ch)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${ch.isActive ? 'bg-blue-600' : 'bg-gray-200'}`}
                  title={ch.isActive ? 'Désactiver' : 'Activer'}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${ch.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <button onClick={() => handleDelete(ch.id)} disabled={deletingId === ch.id}
                  className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 p-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
