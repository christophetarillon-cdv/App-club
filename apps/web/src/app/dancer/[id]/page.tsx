'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { logout } from '@/lib/auth';
import Link from 'next/link';
import type { Dancer } from '@cdv/types';
import { ADMIN_NAV } from '@/lib/admin-nav';

function Avatar({ dancer, size = 'md' }: { dancer: Dancer; size?: 'lg' | 'md' | 'sm' }) {
  const initials = `${dancer.firstName[0] ?? ''}${dancer.lastName[0] ?? ''}`.toUpperCase();
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500',
    'bg-orange-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
  ];
  const color = colors[(dancer.firstName.charCodeAt(0) + dancer.lastName.charCodeAt(0)) % colors.length];
  const sizeClass = size === 'lg' ? 'w-16 h-16 text-2xl rounded-2xl' : size === 'md' ? 'w-11 h-11 text-base rounded-xl' : 'w-9 h-9 text-xs rounded-lg';

  if (dancer.photoUrl) {
    return <img src={dancer.photoUrl} alt={dancer.firstName} className={`${sizeClass} object-cover`} />;
  }
  return (
    <div className={`${sizeClass} ${color} flex items-center justify-center font-bold text-white shrink-0`}>
      {initials}
    </div>
  );
}

interface NavItem {
  href: string;
  label: string;
  available?: boolean;
}

export default function DancerHubPage() {
  const { id } = useParams<{ id: string }>();
  const { user, dancers, loading, account } = useAuth();
  const { selectDancer } = useDancer();
  const router = useRouter();

  const dancer = dancers.find(d => d.id === id);
  const otherDancers = dancers.filter(d => d.id !== id);
  const userRoles = [...(account?.roles ?? []), ...dancers.flatMap(d => d.roles)];
  const isAdmin = userRoles.includes('admin');

  const [pagePermissions, setPagePermissions] = useState<Record<string, string[]>>({});
  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      if (snap.exists()) setPagePermissions((snap.data().pagePermissions ?? {}) as Record<string, string[]>);
    });
  }, []);

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && dancers.length > 0 && !dancer) router.replace('/select-dancer');
  }, [user, loading, dancers, dancer, router]);

  useEffect(() => {
    if (dancer) selectDancer(dancer);
  }, [dancer?.id]);

  const handleSwitchDancer = (d: Dancer) => {
    selectDancer(d);
    router.push(`/dancer/${d.id}`);
  };

  if (loading || !dancer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasPerm = (permKey: string) => {
    if (!(permKey in pagePermissions)) return true;
    const allowed = pagePermissions[permKey] ?? [];
    return isAdmin || userRoles.some(r => allowed.includes(r));
  };

  const navItems: NavItem[] = [
    { href: `/dancer/${id}/card`, label: 'Mon QR code de présence', permKey: '/dancer/card' },
    { href: '/planning', label: 'Planning des cours', permKey: '/planning' },
    { href: '/chat', label: 'Chat', permKey: '/chat' },
    { href: '/media', label: 'Médiathèque', permKey: '/media' },
    { href: '/trombinoscope', label: 'Trombinoscope', permKey: '/trombinoscope' },
  ].filter(item => hasPerm((item as any).permKey));

  const firstAccessibleAdminHref = (() => {
    const allItems = ADMIN_NAV.flatMap(g => g.items);
    if (isAdmin) return '/admin/club-settings';
    const match = allItems.find(item => {
      const allowed = pagePermissions[item.href] ?? ['admin'];
      return userRoles.some(r => allowed.includes(r));
    });
    return match?.href ?? null;
  })();
  const adminItems: NavItem[] = firstAccessibleAdminHref
    ? [{ href: firstAccessibleAdminHref, label: 'Administration' }]
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gray-900 px-5 pt-10 pb-6">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-4">
            <Avatar dancer={dancer} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-white/40 text-xs uppercase tracking-widest">Espace personnel</p>
              <h1 className="text-white text-xl font-bold leading-tight mt-0.5">
                {dancer.firstName} {dancer.lastName}
              </h1>
              {dancer.memberNumber && (
                <p className="text-white/30 text-xs font-mono mt-0.5">{dancer.memberNumber}</p>
              )}
            </div>

            {/* Switcher rapide : mini avatars des autres danseurs */}
            {otherDancers.length > 0 && (
              <div className="flex flex-col items-center gap-2 shrink-0">
                {otherDancers.map(d => (
                  <button
                    key={d.id}
                    onClick={() => handleSwitchDancer(d)}
                    className="relative group"
                    title={`Passer à ${d.firstName}`}
                  >
                    <Avatar dancer={d} size="sm" />
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-white/0 group-hover:text-white/70 text-[9px] whitespace-nowrap transition-colors">
                      {d.firstName}
                    </span>
                  </button>
                ))}
                <p className="text-white/20 text-[9px] mt-1 text-center">Changer</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Accès rapide */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1 mb-3">Accès rapide</p>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {navItems.map((item, i) => (
              item.available === false ? (
                <div key={i} className="flex items-center justify-between px-4 py-3.5 opacity-40">
                  <span className="text-sm text-gray-700">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Bientôt</span>
                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ) : (
                <Link key={i} href={item.href}
                  className="flex items-center justify-between px-4 py-3.5 hover:bg-blue-50/50 transition-colors">
                  <span className="text-sm text-gray-800 font-medium">{item.label}</span>
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )
            ))}
          </div>
        </div>

        {/* Informations personnelles */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1 mb-3">Informations personnelles</p>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
            <Link href={`/dancer/${id}/profile`}
              className="flex items-center justify-between px-4 py-3.5 hover:bg-blue-50/50 transition-colors">
              <span className="text-sm text-gray-800 font-medium">Mes informations</span>
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            {adminItems.map((item, i) => (
              <Link key={i} href={item.href}
                className="flex items-center justify-between px-4 py-3.5 hover:bg-blue-50/50 transition-colors">
                <span className="text-sm text-gray-800 font-medium">{item.label}</span>
                <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>

        {/* Bouton changer de danseur (si plusieurs) */}
        {dancers.length > 1 && (
          <Link href="/select-dancer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-500 hover:bg-gray-50 transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
            </svg>
            Changer de danseur
          </Link>
        )}

        <button
          onClick={async () => { await logout(); router.replace('/login'); }}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
