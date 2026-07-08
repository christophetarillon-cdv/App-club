'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, getDoc, query, where, orderBy, limit,
  addDoc, serverTimestamp, doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { AppShell } from '@/components/AppShell';
import Link from 'next/link';
import type { ChatChannel } from '@cdv/types';

export default function ChatPage() {
  const { user } = useAuth();
  const { selectedDancer } = useDancer();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [unreadChannels, setUnreadChannels] = useState<Set<string>>(new Set());
  const [lastMessages, setLastMessages] = useState<Map<string, { text: string; senderName: string; ts: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showPrivateForm, setShowPrivateForm] = useState(false);
  const [privateText, setPrivateText] = useState('');
  const [sendingPrivate, setSendingPrivate] = useState(false);
  const [privateSent, setPrivateSent] = useState(false);

  useEffect(() => {
    if (!user || !selectedDancer) return;
    (async () => {
      const [snap, membershipSnap, seasonSnap] = await Promise.all([
        getDocs(query(collection(db, 'chatChannels'), where('isActive', '==', true), orderBy('createdAt', 'asc'))),
        getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
        getDocs(collection(db, 'seasons')),
      ]);

      const isAdminOrInstructor =
        selectedDancer.roles.includes('admin') || selectedDancer.roles.includes('instructor');
      const paidIds = new Set(
        membershipSnap.docs
          .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
          .map(d => d.data().seasonId as string).filter(Boolean),
      );
      const currentSeasonId = seasonSnap.docs.find(d => d.data().isActive === true)?.id ?? null;
      const hasCurrentSeason = currentSeasonId ? paidIds.has(currentSeasonId) : false;

      const chans = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ChatChannel))
        .filter(ch => {
          if (isAdminOrInstructor) return true;
          if (ch.newMembersAccess === false) return false;
          return hasCurrentSeason;
        });
      setChannels(chans);

      const dancerSnap = await getDoc(doc(db, 'dancers', selectedDancer.id));
      const chatLastRead: Record<string, number> = (dancerSnap.data()?.chatLastRead as Record<string, number>) ?? {};

      const unread = new Set<string>();
      const msgs = new Map<string, { text: string; senderName: string; ts: number }>();

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
        msgs.set(ch.id, { text: latest.text ?? '', senderName: latest.senderName ?? '', ts: latestMs });
      }));

      setUnreadChannels(unread);
      setLastMessages(msgs);
      setLoading(false);
    })();
  }, [user, selectedDancer?.id]);

  const relativeTime = (ms: number) => {
    const diff = Date.now() - ms;
    if (diff < 60_000) return 'maintenant';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
    const d = new Date(ms);
    return `${d.getDate()}/${d.getMonth()+1}`;
  };

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
    setPrivateText(''); setSendingPrivate(false); setPrivateSent(true); setShowPrivateForm(false);
    setTimeout(() => setPrivateSent(false), 3000);
  };

  // Avatar color per channel index
  const channelColors = ['bg-primary','bg-teal-600','bg-purple-600','bg-pink-600','bg-orange-500','bg-green-600'];

  return (
    <AppShell>
      <div className="relative overflow-hidden pb-8" style={{
        background: 'linear-gradient(180deg, #2F86C0 0%, #7FBFE3 33%, #D8EAF3 66%, #F9F7F4 100%)',
      }}>
        <div className="max-w-md mx-auto px-4 pt-6">
          <h1 className="text-2xl font-extrabold text-white">Chat</h1>
        </div>
        <svg className="absolute bottom-0 left-0 w-full h-8 text-background" viewBox="0 0 400 44" preserveAspectRatio="none" fill="currentColor">
          <path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" />
        </svg>
      </div>

      <div className="max-w-md mx-auto px-4 pb-5 -mt-4 relative space-y-3">

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Chargement…</div>
        ) : channels.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 px-6 py-12 text-center">
            <p className="text-gray-400">Aucun canal disponible.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {channels.map((ch, i) => {
              const hasUnread = unreadChannels.has(ch.id);
              const last = lastMessages.get(ch.id);
              const avatarBg = channelColors[i % channelColors.length];
              return (
                <Link key={ch.id} href={`/chat/${ch.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 ${avatarBg} rounded-xl flex items-center justify-center`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
                        <path d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                      </svg>
                    </div>
                    {hasUnread && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${hasUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>{ch.name}</p>
                    {last ? (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {last.senderName ? `${last.senderName} : ` : ''}{last.text}
                      </p>
                    ) : ch.description ? (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{ch.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {last && <span className="text-[10px] text-gray-400">{relativeTime(last.ts)}</span>}
                    {hasUnread && <span className="w-2 h-2 bg-red-500 rounded-full" />}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {privateSent && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3">
            <p className="text-green-700 text-sm font-medium">Message envoyé à l'administration.</p>
          </div>
        )}

        {showPrivateForm ? (
          <form onSubmit={handleSendPrivate} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h2 className="font-semibold text-gray-800 text-sm">Message à l'administration</h2>
            <textarea value={privateText} onChange={e => setPrivateText(e.target.value)} required rows={4}
              placeholder="Votre message…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <div className="flex gap-3">
              <button type="submit" disabled={sendingPrivate || !privateText.trim()}
                className="flex-1 bg-primary text-white font-semibold py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 text-sm">
                {sendingPrivate ? 'Envoi…' : 'Envoyer'}
              </button>
              <button type="button" onClick={() => setShowPrivateForm(false)}
                className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowPrivateForm(true)}
            className="flex items-center justify-center gap-2 w-full py-3 bg-white rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            Envoyer un message à l'administration
          </button>
        )}
      </div>
    </AppShell>
  );
}
