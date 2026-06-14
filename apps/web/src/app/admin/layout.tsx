'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, account, dancers, loading } = useAuth();
  const router = useRouter();

  const isAdmin =
    account?.roles?.includes('admin') ||
    dancers.some(d => d.roles.includes('admin'));

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (!loading && account !== undefined && !isAdmin) router.replace('/profile');
  }, [user, account, loading, isAdmin, router]);

  if (loading || !user || !isAdmin) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 overflow-x-auto">
        <span className="font-semibold text-gray-800 whitespace-nowrap">Administration CDV</span>
        <Link href="/admin/club-settings" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Club</Link>
        <Link href="/admin/seasons" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Saisons</Link>
        <Link href="/admin/dance-styles" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Styles</Link>
        <Link href="/admin/levels" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Niveaux</Link>
        <Link href="/admin/rooms" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Salles</Link>
        <Link href="/admin/courses" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Cours</Link>
        <Link href="/admin/interruptions" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Interruptions</Link>
        <Link href="/admin/public-holidays" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Jours fériés</Link>
        <Link href="/admin/dancers" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Danseurs</Link>
        <Link href="/admin/trial" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Danseurs essai</Link>
        <Link href="/admin/settings/trial" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Essai</Link>
        <Link href="/admin/settings/welcome-qr" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">QR accueil</Link>
        <Link href="/admin/pricing-plans" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Tarifs</Link>
        <Link href="/admin/payment-plans" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Plans paiement</Link>
        <Link href="/admin/payments/today" className="text-sm font-semibold text-orange-600 hover:text-orange-800 whitespace-nowrap">Encaissements</Link>
        <Link href="/admin/payments/new" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Saisir paiement</Link>
        <Link href="/admin/payments/cheques" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Chèques</Link>
        <Link href="/admin/payments/bank-deposits" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Bordereaux</Link>
        <Link href="/admin/settings/bank-accounts" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Comptes bancaires</Link>
        <Link href="/admin/settings/planning" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Paramètres planning</Link>
        <div className="ml-auto flex-shrink-0 flex items-center gap-4">
          <Link href="/planning" className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap">Voir le planning</Link>
          <Link href="/profile" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Mon profil</Link>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
