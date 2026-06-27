import { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useDancer } from './DancerContext';

interface PagePermissionsContextType {
  hasPerm: (permKey: string) => boolean;
}

const PagePermissionsContext = createContext<PagePermissionsContextType>({
  hasPerm: () => true,
});

export function PagePermissionsProvider({ children }: { children: React.ReactNode }) {
  const { selectedDancer } = useDancer();
  const [permissions, setPermissions] = useState<Record<string, string[]> | null>(null);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main'))
      .then(snap => {
        setPermissions((snap.data()?.pagePermissions ?? {}) as Record<string, string[]>);
      })
      .catch(() => setPermissions({}));
  }, []);

  const dancerRoles: string[] = selectedDancer?.roles ?? [];

  const hasPerm = (permKey: string): boolean => {
    if (permissions === null) return true;
    const allowed = permissions[permKey];
    if (!allowed) return true;
    return dancerRoles.some(r => allowed.includes(r));
  };

  return (
    <PagePermissionsContext.Provider value={{ hasPerm }}>
      {children}
    </PagePermissionsContext.Provider>
  );
}

export const usePagePermissions = () => useContext(PagePermissionsContext);
