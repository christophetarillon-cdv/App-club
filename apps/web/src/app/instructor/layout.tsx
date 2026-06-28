'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  const { user, account, dancers, loading } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const userRoles = [...(account?.roles ?? []), ...dancers.flatMap(d => d.roles)];
  const isAdmin = userRoles.includes('admin');
  const myDancer = dancers[0];

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }

    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      const perms = (snap.data()?.pagePermissions ?? {}) as Record<string, string[]>;
      const allowedRoles = perms['/instructor'] ?? ['admin', 'instructor'];
      const ok = isAdmin || userRoles.some(r => allowedRoles.includes(r));
      if (!ok) router.replace(myDancer ? `/dancer/${myDancer.id}` : '/');
      setAllowed(ok);
    });
  }, [loading, user, isAdmin]);

  if (loading || !user || allowed === null) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 shrink-0">
        {myDancer && (
          <Link href={`/dancer/${myDancer.id}`} className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        <span className="font-semibold text-gray-800 text-sm">Mes séances</span>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
