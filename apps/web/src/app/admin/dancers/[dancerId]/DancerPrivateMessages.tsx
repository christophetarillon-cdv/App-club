'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PrivateMessage } from '@cdv/types';

function fmtTime(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate?.() ?? new Date(ts);
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Même fil que /admin/private-messages (identifié par fromDancerId), mais
// affiché directement sur la fiche du danseur — pas besoin de repasser par
// la liste des conversations pour lui écrire ou lui répondre.
export default function DancerPrivateMessages({
  dancerId, dancerName, accountId,
}: {
  dancerId: string;
  dancerName: string;
  accountId: string;
}) {
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'privateMessages'), where('fromDancerId', '==', dancerId), orderBy('sentAt', 'asc')),
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as PrivateMessage)));
        setLoading(false);
      },
      error => {
        console.error('[DancerPrivateMessages] listener failed:', error);
        setLoading(false);
      },
    );
    return unsub;
  }, [dancerId]);

  useEffect(() => {
    const unread = messages.filter(m => !m.fromAdmin && !m.readAt);
    unread.forEach(m => updateDoc(doc(db, 'privateMessages', m.id), { readAt: serverTimestamp() }));
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await addDoc(collection(db, 'privateMessages'), {
        fromAccountId: accountId,
        fromDancerId: dancerId,
        fromDancerName: dancerName,
        text: reply.trim(),
        fromAdmin: true,
        // Timestamp client : évite le placeholder null pendant l'écriture
        // optimiste, qui retardait l'apparition du message dans le fil.
        sentAt: Timestamp.now(),
      });
      setReply('');
    } catch (error) {
      console.error('[DancerPrivateMessages] send failed:', error);
      setSendError("Le message n'a pas pu être envoyé. Vérifiez votre connexion et réessayez.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-6">
      <h2 className="text-base font-semibold text-gray-900 mb-3">Message privé</h2>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="max-h-96 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-6">Chargement…</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">
              Aucun message pour l'instant — écrivez le premier ci-dessous.
            </p>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`flex ${m.fromAdmin ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${m.fromAdmin ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  <p className="text-sm whitespace-pre-line">{m.text}</p>
                  <p className={`text-[10px] mt-1 ${m.fromAdmin ? 'text-blue-100' : 'text-gray-400'}`}>{fmtTime(m.sentAt)}</p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          {sendError && (
            <p className="mb-2 text-sm text-red-600" role="alert">{sendError}</p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Écrire un message…"
              rows={2}
              className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
            <button
              onClick={handleSend}
              disabled={!reply.trim() || sending}
              className="bg-blue-600 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm shrink-0"
            >
              Envoyer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
