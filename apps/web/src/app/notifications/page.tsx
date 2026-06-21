'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import type { Announcement, NotificationChannel } from '@cdv/types';

function timeAgo(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate?.() ?? new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export default function NotificationsPage() {
  const { user, account } = useAuth();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [channels, setChannels] = useState<Map<string, NotificationChannel>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !account) return;

    const prefs = account.notificationPreferences ?? {};

    getDocs(query(collection(db, 'notificationChannels'), where('isActive', '==', true))).then(async channelSnap => {
      const channelMap = new Map<string, NotificationChannel>();
      const visibleChannelIds: string[] = [];

      channelSnap.docs.forEach(d => {
        const ch = { id: d.id, ...d.data() } as NotificationChannel;
        channelMap.set(d.id, ch);
        if (prefs[d.id] !== false) visibleChannelIds.push(d.id);
      });
      setChannels(channelMap);

      if (visibleChannelIds.length === 0) { setLoading(false); return; }

      // Firestore limite les `in` à 30 éléments — on prend les 30 premiers
      const snap = await getDocs(
        query(
          collection(db, 'notifications'),
          where('channelId', 'in', visibleChannelIds.slice(0, 30)),
          orderBy('sentAt', 'desc'),
        ),
      );
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
    }).finally(() => setLoading(false));
  }, [user, account]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-gray-700 font-semibold mb-3">Connectez-vous pour voir vos notifications.</p>
          <Link href="/login" className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/profile" className="text-sm text-gray-400 hover:text-gray-700">← Profil</Link>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          </div>
          <Link href="/settings/notifications" className="text-sm text-blue-600 hover:text-blue-800">
            Paramètres
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : announcements.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Aucune notification</p>
            <p className="text-gray-400 text-sm mt-1">Les annonces du club apparaîtront ici.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map(a => {
              const ch = channels.get(a.channelId);
              return (
                <div key={a.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4.5 h-4.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-gray-900 leading-snug">{a.title}</p>
                        <span className="text-xs text-gray-400 shrink-0">{timeAgo(a.sentAt)}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{a.body}</p>
                      {ch && (
                        <span className="inline-block mt-2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {ch.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
