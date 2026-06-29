'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import type { ChatChannel, ChatPublisherType } from '@cdv/types';

const PUBLISHER_LABELS: Record<ChatPublisherType, string> = {
  admins_only: 'Admins uniquement',
  specific_dancers: 'Danseurs spécifiques',
  all_members: 'Tous les membres',
};

interface DancerOption { id: string; firstName: string; lastName: string; }

export default function AdminChatChannelsPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [dancers, setDancers] = useState<DancerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [publisherType, setPublisherType] = useState<ChatPublisherType>('admins_only');
  const [publisherIds, setPublisherIds] = useState<string[]>([]);
  const [newMembersAccess, setNewMembersAccess] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'chatChannels'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'dancers'), orderBy('firstNameLower'))),
    ]).then(([chSnap, dSnap]) => {
      setChannels(chSnap.docs.map(d => ({ id: d.id, ...d.data() } as ChatChannel)));
      setDancers(dSnap.docs.map(d => ({ id: d.id, firstName: d.data().firstName, lastName: d.data().lastName })));
      setLoading(false);
    });
  }, []);

  const resetForm = () => {
    setName(''); setDescription(''); setPublisherType('admins_only'); setPublisherIds([]); setNewMembersAccess(true);
    setEditingId(null); setShowForm(false);
  };

  const openEdit = (ch: ChatChannel) => {
    setEditingId(ch.id); setName(ch.name); setDescription(ch.description ?? '');
    setPublisherType(ch.publisherType); setPublisherIds(ch.publisherIds ?? []);
    setNewMembersAccess(ch.newMembersAccess !== false);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const data = {
      name: name.trim(),
      description: description.trim(),
      publisherType,
      publisherIds: publisherType === 'specific_dancers' ? publisherIds : [],
      newMembersAccess,
      isActive: true,
    };
    try {
      if (editingId) {
        await updateDoc(doc(db, 'chatChannels', editingId), data);
        setChannels(prev => prev.map(c => c.id === editingId ? { ...c, ...data } : c));
      } else {
        const ref = await addDoc(collection(db, 'chatChannels'), {
          ...data, createdAt: serverTimestamp(), createdBy: user.uid,
        });
        setChannels(prev => [{ id: ref.id, ...data, createdAt: { seconds: Date.now() / 1000, nanoseconds: 0, toDate: () => new Date(), toMillis: () => Date.now() }, createdBy: user.uid }, ...prev]);
      }
      resetForm();
    } finally { setSaving(false); }
  };

  const handleToggle = async (ch: ChatChannel) => {
    await updateDoc(doc(db, 'chatChannels', ch.id), { isActive: !ch.isActive });
    setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, isActive: !c.isActive } : c));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce canal ? Les messages seront conservés.')) return;
    await deleteDoc(doc(db, 'chatChannels', id));
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  const togglePublisherId = (id: string) =>
    setPublisherIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/profile" className="text-sm text-gray-400 hover:text-gray-700">← Admin</Link>
            <h1 className="text-2xl font-bold text-gray-900">Canaux de chat</h1>
          </div>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
            + Nouveau canal
          </button>
        </div>

        {/* Formulaire */}
        {showForm && (
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6 space-y-4">
            <h2 className="font-semibold text-gray-800">{editingId ? 'Modifier le canal' : 'Nouveau canal'}</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom</label>
              <input value={name} onChange={e => setName(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description (optionnel)</label>
              <input value={description} onChange={e => setDescription(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Qui peut publier ?</label>
              <div className="space-y-2">
                {(['admins_only', 'all_members', 'specific_dancers'] as ChatPublisherType[]).map(t => (
                  <label key={t} className="flex items-center gap-2.5 cursor-pointer">
                    <input type="radio" name="publisherType" value={t} checked={publisherType === t}
                      onChange={() => setPublisherType(t)} className="text-blue-600" />
                    <span className="text-sm text-gray-700">{PUBLISHER_LABELS[t]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={newMembersAccess} onChange={e => setNewMembersAccess(e.target.checked)}
                  className="text-blue-600" />
                <div>
                  <span className="text-sm text-gray-700 font-medium">Accessible aux nouveaux membres</span>
                  <p className="text-xs text-gray-400 mt-0.5">Si désactivé, le canal est réservé aux admins et instructeurs</p>
                </div>
              </label>
            </div>

            {publisherType === 'specific_dancers' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sélectionner les danseurs</label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {dancers.map(d => (
                    <label key={d.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={publisherIds.includes(d.id)} onChange={() => togglePublisherId(d.id)}
                        className="text-blue-600" />
                      <span className="text-sm text-gray-700">{d.firstName} {d.lastName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
                {saving ? 'Sauvegarde…' : 'Enregistrer'}
              </button>
              <button type="button" onClick={resetForm}
                className="flex-1 border border-gray-300 text-gray-600 font-semibold py-2.5 rounded-lg hover:bg-gray-50 text-sm">
                Annuler
              </button>
            </div>
          </form>
        )}

        {/* Liste */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : channels.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400">Aucun canal créé.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {channels.map(ch => (
              <div key={ch.id} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm">{ch.name}</p>
                    {!ch.isActive && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Inactif</span>}
                  {ch.newMembersAccess === false && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Admins seulement</span>}
                  </div>
                  {ch.description && <p className="text-xs text-gray-400 mt-0.5">{ch.description}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{PUBLISHER_LABELS[ch.publisherType]}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Link href={`/admin/chat-channels/${ch.id}`}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium">Messages</Link>
                  <button onClick={() => openEdit(ch)} className="text-xs text-gray-500 hover:text-gray-800">Modifier</button>
                  <button onClick={() => handleToggle(ch)} className="text-xs text-gray-500 hover:text-gray-800">
                    {ch.isActive ? 'Désactiver' : 'Activer'}
                  </button>
                  <button onClick={() => handleDelete(ch.id)} className="text-xs text-red-500 hover:text-red-700">Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
