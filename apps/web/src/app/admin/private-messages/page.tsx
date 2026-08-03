'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import type { PrivateMessage } from '@cdv/types';

function timeAgo(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate?.() ?? new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

function fmtTime(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate?.() ?? new Date(ts);
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface Conversation {
  accountId: string;
  dancerId: string;
  dancerName: string;
  messages: PrivateMessage[];
  lastMessage: PrivateMessage;
  unreadCount: number;
}

export default function AdminPrivateMessagesPage() {
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDancerId, setOpenDancerId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'privateMessages'), orderBy('sentAt', 'asc')),
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as PrivateMessage)));
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // Regroupe par danseur (pas par compte) : sur un compte famille avec
  // plusieurs danseurs, chacun a sa propre conversation avec l'admin.
  const conversations = useMemo(() => {
    const byDancer = new Map<string, PrivateMessage[]>();
    for (const m of messages) {
      const list = byDancer.get(m.fromDancerId) ?? [];
      list.push(m);
      byDancer.set(m.fromDancerId, list);
    }
    const convs: Conversation[] = [...byDancer.entries()].map(([dancerId, msgs]) => ({
      dancerId,
      accountId: msgs[msgs.length - 1].fromAccountId,
      dancerName: msgs[msgs.length - 1].fromDancerName,
      messages: msgs,
      lastMessage: msgs[msgs.length - 1],
      unreadCount: msgs.filter(m => !m.fromAdmin && !m.readAt).length,
    }));
    return convs.sort((a, b) => {
      const at = a.lastMessage.sentAt?.toMillis?.() ?? 0;
      const bt = b.lastMessage.sentAt?.toMillis?.() ?? 0;
      return bt - at;
    });
  }, [messages]);

  const openConversation = conversations.find(c => c.dancerId === openDancerId) ?? null;
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  useEffect(() => {
    if (!openConversation) return;
    const unread = openConversation.messages.filter(m => !m.fromAdmin && !m.readAt);
    unread.forEach(m => updateDoc(doc(db, 'privateMessages', m.id), { readAt: serverTimestamp() }));
  }, [openConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [openConversation?.messages.length]);

  const handleReply = async () => {
    if (!openConversation || !reply.trim() || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'privateMessages'), {
        fromAccountId: openConversation.accountId,
        fromDancerId: openConversation.dancerId,
        fromDancerName: openConversation.dancerName,
        text: reply.trim(),
        fromAdmin: true,
        // Timestamp client : evite le placeholder null pendant l'ecriture
        // optimiste, qui retardait l'apparition du message dans le fil.
        sentAt: Timestamp.now(),
      });
      setReply('');
    } finally {
      setSending(false);
    }
  };

  if (openConversation) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="max-w-2xl mx-auto w-full px-4 py-6 flex flex-col flex-1">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setOpenDancerId(null)} className="text-sm text-gray-400 hover:text-gray-700">← Conversations</button>
            <h1 className="text-lg font-bold text-gray-900">{openConversation.dancerName}</h1>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 mb-4">
            {openConversation.messages.map(m => (
              <div key={m.id} className={`flex ${m.fromAdmin ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${m.fromAdmin ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  <p className="text-sm whitespace-pre-line">{m.text}</p>
                  <p className={`text-[10px] mt-1 ${m.fromAdmin ? 'text-blue-100' : 'text-gray-400'}`}>{fmtTime(m.sentAt)}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
              placeholder="Répondre…"
              rows={2}
              className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
            <button
              onClick={handleReply}
              disabled={!reply.trim() || sending}
              className="bg-blue-600 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm shrink-0"
            >
              Envoyer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile" className="text-sm text-gray-400 hover:text-gray-700">← Admin</Link>
          <h1 className="text-2xl font-bold text-gray-900">Messages privés</h1>
          {totalUnread > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{totalUnread}</span>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : conversations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400">Aucun message privé.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map(c => (
              <button key={c.dancerId} onClick={() => setOpenDancerId(c.dancerId)}
                className={`w-full text-left bg-white rounded-2xl border shadow-sm px-5 py-4 transition-colors hover:border-blue-300 ${c.unreadCount > 0 ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {c.unreadCount > 0 && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                      <span className="text-sm font-semibold text-gray-900">{c.dancerName}</span>
                      <span className="text-xs text-gray-400">{timeAgo(c.lastMessage.sentAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 truncate">
                      {c.lastMessage.fromAdmin ? 'Vous : ' : ''}{c.lastMessage.text}
                    </p>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0">{c.unreadCount}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
