'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import type { NotificationChannel } from '@cdv/types';

const previewFn = httpsCallable<{ channelId: string }, { recipientCount: number }>(
  functions, 'previewNotificationRecipients',
);
const sendFn = httpsCallable<
  { channelId: string; title: string; body: string },
  { recipientCount: number; fcmSuccessCount: number }
>(functions, 'sendNotification');

export default function SendNotificationPage() {
  const { user } = useAuth();

  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [channelId, setChannelId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ recipientCount: number; fcmSuccessCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'notificationChannels'), where('isActive', '==', true), orderBy('createdAt', 'desc')))
      .then(snap => setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificationChannel))));
  }, [user]);

  useEffect(() => {
    if (!channelId) { setRecipientCount(null); return; }
    setLoadingPreview(true);
    previewFn({ channelId })
      .then(res => setRecipientCount(res.data.recipientCount))
      .catch(() => setRecipientCount(null))
      .finally(() => setLoadingPreview(false));
  }, [channelId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelId || !title.trim() || !body.trim()) return;
    if (!confirm(`Envoyer à ${recipientCount ?? '?'} personne(s) ?`)) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendFn({ channelId, title: title.trim(), body: body.trim() });
      setSent(res.data);
      setTitle(''); setBody(''); setChannelId(''); setRecipientCount(null);
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile" className="text-sm text-gray-400 hover:text-gray-700">← Profil</Link>
          <h1 className="text-2xl font-bold text-gray-900">Envoyer une notification</h1>
        </div>

        {sent && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 mb-5 flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="font-semibold text-green-800">Notification envoyée</p>
              <p className="text-sm text-green-700 mt-0.5">
                {sent.recipientCount} destinataire{sent.recipientCount !== 1 ? 's' : ''} · {sent.fcmSuccessCount} push reçu{sent.fcmSuccessCount !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={() => setSent(null)} className="ml-auto text-green-500 hover:text-green-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Canal</label>
            <select value={channelId} onChange={e => setChannelId(e.target.value)} required
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white">
              <option value="">Choisir un canal…</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>
            {channelId && (
              <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                {loadingPreview ? (
                  <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
                {recipientCount !== null ? `${recipientCount} destinataire${recipientCount !== 1 ? 's' : ''}` : loadingPreview ? 'Calcul…' : ''}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required
              placeholder="ex. Fermeture exceptionnelle"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} required rows={4}
              placeholder="Contenu de la notification…"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          {/* Aperçu */}
          {(title || body) && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Aperçu push</p>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{title || 'Titre'}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{body || 'Message…'}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={sending || !channelId || !title.trim() || !body.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {sending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Envoi…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                  Envoyer
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-4 flex justify-center">
          <Link href="/admin/notification-channels"
            className="text-sm text-gray-400 hover:text-gray-600">
            Gérer les canaux →
          </Link>
        </div>
      </div>
    </div>
  );
}
