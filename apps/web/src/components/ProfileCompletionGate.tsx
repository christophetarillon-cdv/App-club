'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// Verrou permanent (pas juste au login) : un danseur peut être marqué
// "profil à compléter" pendant que l'app est déjà ouverte (cotisation
// payée par un tiers sans droits d'édition) — grâce aux écouteurs
// Firestore temps réel de AuthContext, ce check se redéclenche à chaque
// changement, pas seulement à la connexion.
export function ProfileCompletionGate({ children }: { children: React.ReactNode }) {
  const { user, dancers, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const needsProfileCompletion = dancers.some(d => d.profileCompletionRequired);
  const onCompleteProfile = pathname === '/complete-profile';
  const onLogin = pathname === '/login' || pathname === '/welcome' || pathname.startsWith('/welcome/');

  useEffect(() => {
    if (loading || !user || onLogin) return;
    if (needsProfileCompletion && !onCompleteProfile) {
      router.replace('/complete-profile');
    }
  }, [loading, user, needsProfileCompletion, onCompleteProfile, onLogin, router]);

  if (!loading && user && needsProfileCompletion && !onCompleteProfile && !onLogin) {
    return null;
  }

  return <>{children}</>;
}
