import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Comptabilité',
  description: 'Gestion comptable du club',
};

interface AccountingLayoutProps {
  children: React.ReactNode;
}

export default function AccountingLayout({ children }: AccountingLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Comptabilité</h1>
          <p className="text-gray-500 mt-2">Gestion des écritures, rapprochement bancaire et rapports</p>
        </div>
      </div>

      <nav className="flex gap-4 border-b">
        <a
          href="/admin/accounting/journal"
          className="px-4 py-2 border-b-2 border-transparent hover:border-blue-500 transition"
        >
          Journal
        </a>
        <a
          href="/admin/accounting/reconciliation"
          className="px-4 py-2 border-b-2 border-transparent hover:border-blue-500 transition"
        >
          Rapprochement
        </a>
        <a
          href="/admin/accounting/analytics"
          className="px-4 py-2 border-b-2 border-transparent hover:border-blue-500 transition"
        >
          Ventilations
        </a>
        <a
          href="/admin/accounting/reports"
          className="px-4 py-2 border-b-2 border-transparent hover:border-blue-500 transition"
        >
          Rapports
        </a>
        <a
          href="/admin/accounting/settings"
          className="px-4 py-2 border-b-2 border-transparent hover:border-blue-500 transition"
        >
          Paramètres
        </a>
      </nav>

      <div>{children}</div>
    </div>
  );
}
