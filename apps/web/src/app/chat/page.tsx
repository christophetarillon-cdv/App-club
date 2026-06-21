'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, getDoc, query, where, orderBy, limit,
  addDoc, serverTimestamp, doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import Link from 'next/link';
import type { ChatChannel } from '@cdv/types';

export default function ChatPage() {
  const { user } = useAuth();
  const { selectedDancer } = useDancer();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [unreadChannels, setUnreadChannels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showPrivateForm, setShowPrivateForm] = useState(false);
  const [privateText, setPrivateText] = useState('');
  const [sendingPrivate, setSendingPrivate] = useState(false);
  const [privateSent, setPrivateSent] = useState(false);

  useEffect(() => {
    if (!user || !selectedDancer) return;

    const load = async () => {
      // Load channels
      const snap = await getDocs(
        query(collection(db, 'chatChannels'), where('isActive', '==', true), orderBy('createdAt', 'asc'))
      );
      const chans = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatChannel));
      setChannels(chans);

      // Load dancer's fresh chatLastRead (may differ from context if updated since login)
      const dancerSnap = await getDoc(doc(db, 'dancers', selectedDancer.id));
      const chatLastRead: Record<string, number> = (dancerSnap.data()?.chatLastRead as Record<string, number>) ?? {};

      // For each channel, get the latest message and check if unread
      const unread = new Set<string>();
      await Promise.all(chans.map(async ch => {
        const msgSnap = await getDocs(
          query(collection(db, 'chatMessages'), where('channelId', '==', ch.id), orderBy('sentAt', 'desc'), limit(1))
        );
        if (msgSnap.empty) return;
        const latest = msgSnap.docs[0].data();
        if (!latest.sentAt) return;
        const latestMs: number = latest.sentAt.toMillis?.() ?? latest.sentAt.seconds * 1000;
        const lastRead = chatLastRead[ch.id] ?? 0;
        if (latestMs > lastRead) unread.add(ch.id);
      }));
      setUnreadChannels(unread);
      setLoading(false);
    };

    load();
  }, [user, selectedDancer?.id]);

  const handleSendPrivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedDancer || !privateText.trim()) return;
    setSendingPrivate(true);
    await addDoc(collection(db, 'privateMessages'), {
      fromDancerId: selectedDancer.id,
      fromDancerName: `${selectedDancer.firstName} ${selectedDancer.lastName}`,
      fromAccountId: user.uid,
      text: privateText.trim(),
      sentAt: serverTimestamp(),
    });
    setPrivateText('');
    setSendingPrivate(false);
    setPrivateSent(true);
    setShowPrivateForm(false);
    setTimeout(() => setPrivateSent(false), 3000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href={selectedDancer ? `/dancer/${selectedDancer.id}` : '/select-dancer'} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
          <h1 className="text-xl font-bold text-gray-900">Chat</h1>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : channels.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400">Aucun canal disponible.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden mb-4">
            {channels.map(ch => {
              const hasUnread = unreadChannels.has(ch.id);
              return (
                <Link key={ch.id} href={`/chat/${ch.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-blue-50/40 transition-colors">
                  <div className="relative">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                      </svg>
                    </div>
                    {hasUnread && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${hasUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-900'}`}>{ch.name}</p>
                    {ch.description && <p className="text-xs text-gray-400 mt-0.5">{ch.description}</p>}
                  </div>
                  {hasUnread && (
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full shrink-0" />
                  )}
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}

        {/* Message privé à l'admin */}
        {privateSent && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3 mb-4">
            <p className="text-green-700 text-sm font-medium">Message envoyé à l'administration.</p>
          </div>
        )}

        {showPrivateForm ? (
          <form onSubmit={handleSendPrivate} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h2 className="font-semibold text-gray-800 text-sm">Message à l'administration</h2>
            <textarea
              value={privateText}
              onChange={e => setPrivateText(e.target.value)}
              required
              rows={4}
              placeholder="Votre message…"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <div className="flex gap-3">
              <button type="submit" disabled={sendingPrivate || !privateText.trim()}
                className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm">
                {sendingPrivate ? 'Envoi…' : 'Envoyer'}
              </button>
              <button type="button" onClick={() => setShowPrivateForm(false)}
                className="flex-1 border border-gray-300 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowPrivateForm(true)}
            className="flex items-center justify-center gap-2 w-full py-3 bg-white rounded-2xl border border-gray-200 shadow-sm text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            Envoyer un message à l'administration
          </button>
        )}
      </div>
    </div>
  );
}
