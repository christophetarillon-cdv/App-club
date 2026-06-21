'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
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

export default function AdminPrivateMessagesPage() {
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'privateMessages'), orderBy('sentAt', 'desc')),
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as PrivateMessage)));
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const markRead = async (id: string) => {
    await updateDoc(doc(db, 'privateMessages', id), { readAt: serverTimestamp() });
  };

  const unreadCount = messages.filter(m => !m.readAt).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile" className="text-sm text-gray-400 hover:text-gray-700">← Admin</Link>
          <h1 className="text-2xl font-bold text-gray-900">Messages privés</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : messages.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400">Aucun message privé.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(m => (
              <div key={m.id} onClick={() => !m.readAt && markRead(m.id)}
                className={`bg-white rounded-2xl border shadow-sm px-5 py-4 cursor-pointer transition-colors ${!m.readAt ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!m.readAt && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                      <span className="text-sm font-semibold text-gray-900">{m.fromDancerName}</span>
                      <span className="text-xs text-gray-400">{timeAgo(m.sentAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{m.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
