'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, orderBy, where, deleteDoc, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ChatChannel, ChatMessage } from '@cdv/types';

function timeAgo(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate?.() ?? new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export default function AdminChatChannelMessagesPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const [channel, setChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDoc(doc(db, 'chatChannels', channelId)).then(snap => {
      if (snap.exists()) setChannel({ id: snap.id, ...snap.data() } as ChatChannel);
    });
  }, [channelId]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'chatMessages'), where('channelId', '==', channelId), orderBy('sentAt', 'asc')),
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
        setLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    );
    return unsub;
  }, [channelId]);

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce message ?')) return;
    await deleteDoc(doc(db, 'chatMessages', id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/chat-channels" className="text-sm text-gray-400 hover:text-gray-700">← Canaux</Link>
          <h1 className="text-xl font-bold text-gray-900">{channel?.name ?? '…'}</h1>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : messages.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400">Aucun message.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(m => (
              <div key={m.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">{m.authorName}</span>
                      <span className="text-xs text-gray-400">{timeAgo(m.sentAt)}</span>
                    </div>
                    {m.text && <p className="text-sm text-gray-700 whitespace-pre-line">{m.text}</p>}
                    {m.mediaUrl && (
                      <div className="mt-2">
                        {m.mediaType === 'image' && <img src={m.mediaUrl} className="max-h-48 rounded-xl object-cover" />}
                        {m.mediaType === 'audio' && <audio controls src={m.mediaUrl} className="w-full" />}
                        {m.mediaType === 'video' && <video controls src={m.mediaUrl} className="max-h-48 w-full rounded-xl" />}
                        {m.fileName && <p className="text-xs text-gray-400 mt-1">{m.fileName}</p>}
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleDelete(m.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
