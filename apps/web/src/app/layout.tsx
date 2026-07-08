import type { Metadata } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import { DancerProvider } from '@/contexts/DancerContext';
import { ProfileCompletionGate } from '@/components/ProfileCompletionGate';
import './globals.css';

export const metadata: Metadata = {
  title: 'Club de Danse Voiron / Coublevie',
  description: 'Application de gestion du club de danse',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
        <AuthProvider>
          <DancerProvider>
            <ProfileCompletionGate>{children}</ProfileCompletionGate>
          </DancerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
