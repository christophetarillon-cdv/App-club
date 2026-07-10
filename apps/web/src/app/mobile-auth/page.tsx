'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase';

function MobileAuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = params.get('token');
    const next = params.get('next') ?? '/';
    if (!token) { setError(true); return; }
    signInWithCustomToken(auth, token)
      .then(() => router.replace(next))
      .catch(() => setError(true));
  }, [params, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <p className="text-gray-500">Connexion impossible. Ferme et rouvre cet écran.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

export default function MobileAuthPage() {
  return (
    <Suspense fallback={null}>
      <MobileAuthInner />
    </Suspense>
  );
}
