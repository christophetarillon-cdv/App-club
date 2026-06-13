'use client';
// Kept for backward compatibility — Firebase is now initialized via AuthContext
export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
