'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { NotificationChannel, ChatChannel } from '@cdv/types';

const TYPE_LABELS: Record<string, string> = {
  main: 'Tous les membres',
  course: 'Cours',
  style: 'Style de danse',
  custom: 'Personnalisé',
};

export default function DancerNotificationSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { user, dancers, loading } = useAuth();
  const router = useRouter();

  const dancer = dancers.find(d => d.id === id);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (!loading && !dancer) router.replace('/select-dancer');
  }, [loading, dancer, router]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!user || !dancer) return;
    setPrefs(dancer.notificationPreferences ?? {});
    Promise.all([
      getDocs(query(collection(db, 'notificationChannels'), where('isActive', '==', true))),
      getDocs(query(collection(db, 'chatChannels'), where('isActive', '==', true))),
    ]).then(([notifSnap, chatSnap]) => {
      setChannels(notifSnap.docs.map(d => ({ id: d.id, ...d.data() } as NotificationChannel)));
      setChatChannels(chatSnap.docs.map(d => ({ id: d.id, ...d.data() } as ChatChannel)));
    }).finally(() => setLoadingData(false));
  }, [user, dancer?.id]);

  const handleToggle = async (channelId: string, enabled: boolean) => {
    if (!id) return;
    setSaving(channelId);
    const newPrefs = { ...prefs, [channelId]: enabled };
    setPrefs(newPrefs);
    try {
      await updateDoc(doc(db, 'dancers', id), {
        [`notificationPreferences.${channelId}`]: enabled,
      });
    } catch {
      setPrefs(prefs);
    } finally {
      setSaving(null);
    }
  };

  const requestPermission = async () => {
    const status = await Notification.requestPermission();
    setPermissionStatus(status);
    if (status === 'granted') window.location.reload();
  };

  if (loading || !dancer) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/dancer/${id}/profile`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
          <h1 className="text-xl font-bold text-gray-900">Paramètres notifications</h1>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Paramètres pour <span className="font-semibold text-gray-700">{dancer.firstName}</span>
        </p>

        {permissionStatus && permissionStatus !== 'granted' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-5 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="flex-1">
              <p className="font-semibold text-amber-800 text-sm">Notifications non autorisées</p>
              <p className="text-amber-700 text-sm mt-0.5">
                {permissionStatus === 'denied'
                  ? 'Modifiez les paramètres de votre navigateur pour autoriser les notifications.'
                  : 'Autorisez les notifications pour recevoir les alertes du club.'}
              </p>
            </div>
            {permissionStatus === 'default' && (
              <button onClick={requestPermission}
                className="shrink-0 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700">
                Autoriser
              </button>
            )}
          </div>
        )}

        {loadingData ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : channels.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-500">Aucun canal configuré.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {channels.map(ch => {
              const enabled = prefs[ch.id] !== false;
              return (
                <div key={ch.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{ch.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{TYPE_LABELS[ch.type] ?? ch.type}</p>
                  </div>
                  <button
                    onClick={() => handleToggle(ch.id, !enabled)}
                    disabled={saving === ch.id}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Canaux chat */}
        {chatChannels.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1 mb-3">Notifications chat</p>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
              {chatChannels.map(ch => {
                const key = `chat_${ch.id}`;
                const enabled = prefs[key] !== false;
                return (
                  <div key={ch.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{ch.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Canal de chat</p>
                    </div>
                    <button
                      onClick={() => handleToggle(key, !enabled)}
                      disabled={saving === key}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-6">
          Ces paramètres s'appliquent uniquement à <span className="font-medium">{dancer.firstName}</span>.
        </p>
      </div>
    </div>
  );
}
