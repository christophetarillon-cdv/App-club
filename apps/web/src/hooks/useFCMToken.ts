'use client';

import { useEffect, useRef } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { User } from 'firebase/auth';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export function useFCMToken(user: User | null) {
  const tokenRef = useRef<string | null>(null);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      if (tokenRef.current && uidRef.current) {
        updateDoc(doc(db, 'accounts', uidRef.current), {
          fcmTokens: arrayRemove(tokenRef.current),
        }).catch(() => {});
        tokenRef.current = null;
        uidRef.current = null;
      }
      return;
    }

    uidRef.current = user.uid;

    if (!VAPID_KEY || typeof window === 'undefined' || !('Notification' in window)) return;

    const register = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const { getMessaging, getToken } = await import('firebase/messaging');
        const messaging = getMessaging();
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: sw,
        });
        if (token && token !== tokenRef.current) {
          tokenRef.current = token;
          await updateDoc(doc(db, 'accounts', user.uid), {
            fcmTokens: arrayUnion(token),
          });
        }
      } catch {
        // Notifications non disponibles ou refusées — silencieux
      }
    };

    register();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);
}
