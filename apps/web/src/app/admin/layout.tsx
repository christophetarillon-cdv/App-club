'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { ADMIN_NAV } from '@/lib/admin-nav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, account, dancers, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [pagePermissions, setPagePermissions] = useState<Record<string, string[]> | null>(null);

  const userRoles: string[] = [
    ...(account?.roles ?? []),
    ...dancers.flatMap(d => d.roles),
  ];
  const isAdmin = userRoles.includes('admin');

  // Charge les permissions de pages une fois l'auth confirmée
  useEffect(() => {
    if (loading || !user) return;
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      setPagePermissions((snap.data()?.pagePermissions ?? {}) as Record<string, string[]>);
    });
  }, [loading, user]);

  // Redirige si non authentifié ou non autorisé
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (account !== undefined && !isAdmin && !userRoles.some(r => r !== 'member' && r !== 'trial')) {
      router.replace('/profile');
    }
  }, [user, account, loading, isAdmin, router]);

  // Vérifie l'accès à la page courante une fois les permissions chargées
  useEffect(() => {
    if (!pagePermissions || isAdmin) return;
    const allItems = ADMIN_NAV.flatMap(g => g.items);
    const match = allItems.find(item => pathname === item.href || pathname.startsWith(item.href + '/'));
    if (!match) return;
    const allowed = pagePermissions[match.href] ?? ['admin'];
    if (!userRoles.some(r => allowed.includes(r))) {
      // Redirige vers la première page accessible
      const first = allItems.find(item => {
        const a = pagePermissions[item.href] ?? ['admin'];
        return userRoles.some(r => a.includes(r));
      });
      router.replace(first ? first.href : '/profile');
    }
  }, [pagePermissions, pathname, userRoles, isAdmin, router]);

  if (loading || !user || (!isAdmin && pagePermissions === null)) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>;
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  // Filtre le nav selon les permissions
  const visibleNav = ADMIN_NAV.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (isAdmin) return true;
      const allowed = pagePermissions?.[item.href] ?? ['admin'];
      return userRoles.some(r => allowed.includes(r));
    }),
  })).filter(group => group.items.length > 0);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="px-4 py-4 border-b border-gray-100 shrink-0">
          <span className="font-bold text-gray-900 text-sm">Administration CDV</span>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
          {visibleNav.map((group) => (
            <div key={group.label}>
              <p className="px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={[
                          'block px-3 py-1.5 rounded-md text-sm transition-colors',
                          active
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : item.highlight
                            ? 'text-orange-600 hover:bg-orange-50 font-medium'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                        ].join(' ')}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-gray-100 shrink-0 space-y-1">
          <Link href="/planning" className="block text-xs text-blue-600 hover:text-blue-800">
            Voir le planning
          </Link>
          <Link href="/profile" className="block text-xs text-gray-500 hover:text-gray-700">
            Mon profil
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
