'use client';

import { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, serverTimestamp, getDoc, getDocs, doc, updateDoc, Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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

export default function ChatChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const { user, account } = useAuth();
  const { selectedDancer } = useDancer();
  const router = useRouter();

  const [channel, setChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seasonFloorMs, setSeasonFloorMs] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDoc(doc(db, 'chatChannels', channelId)).then(snap => {
      if (snap.exists()) setChannel({ id: snap.id, ...snap.data() } as ChatChannel);
    });
  }, [channelId]);

  // Mark channel as read on open
  useEffect(() => {
    if (!selectedDancer) return;
    updateDoc(doc(db, 'dancers', selectedDancer.id), {
      [`chatLastRead.${channelId}`]: Date.now(),
    }).catch(() => {});
  }, [channelId, selectedDancer?.id]);

  // Plancher de date : début du bloc de saisons consécutives le plus récent de l'utilisateur.
  // Exemple : validé 2024-25 ✓, 2025-26 ✗, 2026-27 ✓ → plancher = début 2026-27 (le trou bloque).
  useEffect(() => {
    if (!user) return;
    const isAdminOrInstructor =
      (account?.roles ?? []).includes('admin') ||
      (selectedDancer?.roles ?? []).includes('admin') ||
      (selectedDancer?.roles ?? []).includes('instructor');
    if (isAdminOrInstructor) { setSeasonFloorMs(0); return; }
    Promise.all([
      getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
      getDocs(collection(db, 'seasons')),
    ]).then(([membershipSnap, seasonSnap]) => {
      const paidIds = new Set(
        membershipSnap.docs
          .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
          .map(d => d.data().seasonId as string).filter(Boolean),
      );
      // Trier toutes les saisons par startDate, en ignorant celles sans date
      const sortedSeasons = seasonSnap.docs
        .map(d => ({ id: d.id, startSec: d.data().startDate?.seconds ?? 0 }))
        .filter(s => s.startSec > 0)
        .sort((a, b) => a.startSec - b.startSec);

      if (sortedSeasons.length === 0 || paidIds.size === 0) {
        setSeasonFloorMs(Date.now());
        return;
      }
      // Saisons validées par l'utilisateur, triées
      const userSeasons = sortedSeasons.filter(s => paidIds.has(s.id));
      if (userSeasons.length === 0) { setSeasonFloorMs(Date.now()); return; }

      // Partir de la saison la plus récente et remonter tant que les saisons sont consécutives
      const mostRecent = userSeasons[userSeasons.length - 1]!;
      let floorSec = mostRecent.startSec;
      let idx = sortedSeasons.findIndex(s => s.id === mostRecent.id);
      while (idx > 0) {
        const prev = sortedSeasons[idx - 1]!;
        if (paidIds.has(prev.id)) { floorSec = prev.startSec; idx--; } else break;
      }
      setSeasonFloorMs(floorSec * 1000);
    });
  }, [user?.uid, account?.roles?.join(','), selectedDancer?.id]);

  useEffect(() => {
    if (seasonFloorMs === null) return;
    const q = seasonFloorMs > 0
      ? query(
          collection(db, 'chatMessages'),
          where('channelId', '==', channelId),
          where('sentAt', '>=', Timestamp.fromMillis(seasonFloorMs)),
          orderBy('sentAt', 'asc'),
        )
      : query(collection(db, 'chatMessages'), where('channelId', '==', channelId), orderBy('sentAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return unsub;
  }, [channelId, seasonFloorMs]);

  const isAdmin = account?.roles?.includes('admin');
  const canPublish = (() => {
    if (!channel || !selectedDancer) return false;
    if (isAdmin) return true;
    if (channel.publisherType === 'all_members') return true;
    if (channel.publisherType === 'specific_dancers') {
      return channel.publisherIds?.includes(selectedDancer.id) ?? false;
    }
    return false;
  })();

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedDancer || !text.trim()) return;
    setSending(true);
    await addDoc(collection(db, 'chatMessages'), {
      channelId,
      authorId: selectedDancer.id,
      authorName: `${selectedDancer.firstName} ${selectedDancer.lastName}`,
      authorPhotoUrl: selectedDancer.photoUrl ?? null,
      text: text.trim(),
      sentAt: serverTimestamp(),
    });
    setText('');
    setSending(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedDancer) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const mediaType: 'image' | 'audio' | 'video' = file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('audio/') ? 'audio' : 'video';
    const path = `chat/${channelId}/${Date.now()}.${ext}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const mediaUrl = await getDownloadURL(storageRef);
    await addDoc(collection(db, 'chatMessages'), {
      channelId,
      authorId: selectedDancer.id,
      authorName: `${selectedDancer.firstName} ${selectedDancer.lastName}`,
      authorPhotoUrl: selectedDancer.photoUrl ?? null,
      mediaUrl,
      mediaType,
      fileName: file.name,
      sentAt: serverTimestamp(),
    });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/chat" className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <h1 className="text-lg font-bold text-gray-900">{channel?.name ?? '…'}</h1>
      </div>

      {/* Messages */}
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Aucun message pour l'instant.</div>
        ) : (
          messages.map(m => {
            const isMe = m.authorId === selectedDancer?.id;
            return (
              <div key={m.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${isMe ? 'bg-blue-500' : 'bg-gray-400'}`}>
                  {m.authorPhotoUrl
                    ? <img src={m.authorPhotoUrl} className="w-8 h-8 rounded-full object-cover" />
                    : m.authorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                  }
                </div>
                <div className={`max-w-xs ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className={`flex items-center gap-2 mb-0.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs font-medium text-gray-600">{m.authorName}</span>
                    <span className="text-[10px] text-gray-400">{timeAgo(m.sentAt)}</span>
                  </div>
                  <div className={`rounded-2xl px-4 py-2.5 ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-gray-200 shadow-sm text-gray-800 rounded-tl-sm'}`}>
                    {m.text && <p className="text-sm whitespace-pre-line">{m.text}</p>}
                    {m.mediaUrl && (
                      <div className="mt-1">
                        {m.mediaType === 'image' && <img src={m.mediaUrl} className="max-h-48 rounded-xl object-cover" />}
                        {m.mediaType === 'audio' && <audio controls src={m.mediaUrl} className="w-48" />}
                        {m.mediaType === 'video' && <video controls src={m.mediaUrl} className="max-h-48 rounded-xl" />}
                        {m.fileName && (
                          <a href={m.mediaUrl} download={m.fileName}
                            className={`block text-xs mt-1 underline ${isMe ? 'text-blue-100' : 'text-blue-600'}`}>
                            ↓ Télécharger
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Zone de saisie */}
      {canPublish ? (
        <div className="bg-white border-t border-gray-200 px-4 py-3 sticky bottom-0">
          <div className="max-w-2xl mx-auto">
            <form onSubmit={handleSend} className="flex gap-2 items-end">
              {/* Bouton média */}
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50 shrink-0">
                {uploading ? (
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*,audio/*,video/*" className="hidden" onChange={handleFile} />

              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) handleSend(e as any); } }}
                placeholder="Message…"
                rows={1}
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 max-h-32"
              />
              <button type="submit" disabled={sending || !text.trim()}
                className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="bg-gray-100 border-t border-gray-200 px-4 py-3 text-center">
          <p className="text-sm text-gray-400">Vous êtes en lecture seule sur ce canal.</p>
        </div>
      )}
    </div>
  );
}
