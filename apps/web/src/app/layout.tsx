import type { Metadata } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import { DancerProvider } from '@/contexts/DancerContext';
import { ProfileCompletionGate } from '@/components/ProfileCompletionGate';
import { isProdEnvironment } from '@/lib/firebase';
import './globals.css';

export const metadata: Metadata = {
  title: 'Club de Danse Voiron / Coublevie',
  description: 'Application de gestion du club de danse',
};

// Repère visuel permanent tant qu'on n'est pas connecté aux vraies données
// (clubvoiron-prod) — même principe que le badge DEV de l'app mobile.
function DevBadge() {
  if (isProdEnvironment) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        padding: '3px 10px',
        borderRadius: 20,
        backgroundColor: '#EF4444',
        color: '#fff',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.5,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      DEV
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
        <AuthProvider>
          <DancerProvider>
            <ProfileCompletionGate>{children}</ProfileCompletionGate>
          </DancerProvider>
        </AuthProvider>
        <DevBadge />
      </body>
    </html>
  );
}
