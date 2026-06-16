'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  const { user, account, dancers, loading } = useAuth();
  const router = useRouter();

  const isInstructor =
    account?.roles?.includes('admin') ||
    dancers.some(d => d.roles.includes('instructor') || d.roles.includes('admin'));

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (account !== undefined && !isInstructor) router.replace('/profile');
  }, [user, account, loading, isInstructor, router]);

  if (loading || !user || !isInstructor) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4">
        <Link href="/profile" className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <span className="font-semibold text-gray-800">Vue Moniteur</span>
      </nav>
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
