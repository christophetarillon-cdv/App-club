'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace('/profile');
  }, [user, loading, router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>;
  if (user) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {children}
    </div>
  );
}
