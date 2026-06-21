'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { onSnapshot, doc, query, collection, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Account, Dancer } from '@cdv/types';

interface AuthContextValue {
  user: User | null;
  account: Account | null;
  dancers: Dancer[];
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  account: null,
  dancers: [],
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubAccount: (() => void) | null = null;
    let unsubDancers: (() => void) | null = null;

    const safetyTimer = setTimeout(() => setLoading(false), 5000);

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(safetyTimer);
      if (unsubAccount) { unsubAccount(); unsubAccount = null; }
      if (unsubDancers) { unsubDancers(); unsubDancers = null; }

      setUser(firebaseUser);

      if (!firebaseUser) {
        setAccount(null);
        setDancers([]);
        setLoading(false);
        return;
      }

      let accountLoaded = false;
      let dancersLoaded = false;

      const checkLoaded = () => {
        if (accountLoaded && dancersLoaded) setLoading(false);
      };

      unsubAccount = onSnapshot(
        doc(db, 'accounts', firebaseUser.uid),
        (snap) => {
          setAccount(snap.exists() ? (snap.data() as Account) : null);
          accountLoaded = true;
          checkLoaded();
        },
        () => { accountLoaded = true; checkLoaded(); },
      );

      unsubDancers = onSnapshot(
        query(collection(db, 'dancers'), where('accountId', '==', firebaseUser.uid)),
        (snap) => {
          setDancers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Dancer)));
          dancersLoaded = true;
          checkLoaded();
        },
        () => { dancersLoaded = true; checkLoaded(); },
      );
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubAuth();
      if (unsubAccount) unsubAccount();
      if (unsubDancers) unsubDancers();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, account, dancers, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export const useIsAdmin = () => {
  const { account, dancers } = useAuth();
  return (
    (account?.roles?.includes('admin') ?? false) ||
    dancers.some(d => d.roles.includes('admin'))
  );
};
