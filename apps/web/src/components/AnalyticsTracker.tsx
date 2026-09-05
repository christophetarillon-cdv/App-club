'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { logEvent, trackedScreenFromPathname } from '@/lib/analytics';

// Tracing d'usage — un session_start par connexion, un screen_view par page
// principale ouverte (voir @/lib/analytics pour la liste suivie). Placé au
// niveau racine (pas dans (protected)/layout.tsx) car plusieurs pages
// suivies (audio, media, chat, planning, trombinoscope) vivent hors du
// groupe de routes (protected).
export function AnalyticsTracker() {
  const { user } = useAuth();
  const pathname = usePathname();
  const sessionLoggedRef = useRef(false);
  const lastScreenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || sessionLoggedRef.current) return;
    sessionLoggedRef.current = true;
    logEvent('session_start', { userId: user.uid });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const screen = trackedScreenFromPathname(pathname);
    if (!screen || screen === lastScreenRef.current) return;
    lastScreenRef.current = screen;
    logEvent('screen_view', { userId: user.uid, screen });
  }, [user, pathname]);

  return null;
}
