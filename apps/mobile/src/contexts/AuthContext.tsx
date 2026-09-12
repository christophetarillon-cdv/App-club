import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where, doc, onSnapshot as onDocSnapshot } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '@/lib/firebase';
import { useBadgeCount } from '@/lib/useBadgeCount';
import type { Account, Dancer } from '@cdv/types';

interface AuthContextType {
  user: User | null;
  account: Account | null;
  dancers: Dancer[];
  loading: boolean;
  markMessagesAsRead?: (dancerId?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
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
  // Don't use dancerId here - will be called with it from components
  const { markAsRead: markAsReadHook } = useBadgeCount();

  useEffect(() => {
    let unsubAccount: (() => void) | null = null;
    let unsubDancers: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, firebaseUser => {
      unsubAccount?.();
      unsubDancers?.();

      if (!firebaseUser) {
        setUser(null);
        setAccount(null);
        setDancers([]);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      let accountLoaded = false;
      let dancersLoaded = false;
      const checkLoaded = () => {
        if (accountLoaded && dancersLoaded) setLoading(false);
      };

      unsubAccount = onDocSnapshot(doc(db, 'accounts', firebaseUser.uid), snap => {
        setAccount(snap.exists() ? ({ id: snap.id, ...snap.data() } as Account) : null);
        accountLoaded = true;
        checkLoaded();
      }, () => { accountLoaded = true; checkLoaded(); });

      unsubDancers = onSnapshot(
        query(collection(db, 'dancers'), where('accountId', '==', firebaseUser.uid)),
        snap => {
          // Les danseurs anonymisés (suppression de compte) restent en base
          // pour les obligations comptables mais ne doivent plus apparaître
          // côté app (sélection de danseur, etc.).
          setDancers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Dancer)).filter(d => !d.isDeleted));
          dancersLoaded = true;
          checkLoaded();
        },
        () => { dancersLoaded = true; checkLoaded(); }
      );
    });

    return () => {
      unsubAuth();
      unsubAccount?.();
      unsubDancers?.();
    };
  }, []);

  const markMessagesAsRead = async (dancerId?: string) => {
    try {
      if (dancerId) {
        const storageKey = `badge_last_visited_${dancerId}`;
        await AsyncStorage.setItem(storageKey, new Date().toISOString());
        await Notifications.setBadgeCountAsync(0);
      }
    } catch (error) {
      console.error('[AuthContext] Error marking as read:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, account, dancers, loading, markMessagesAsRead }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
