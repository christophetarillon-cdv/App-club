import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where, doc, onSnapshot as onDocSnapshot } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db, functions } from '@/lib/firebase';
import { dismissAllPresented } from '@/lib/notificationTray';
import { useBadgeCount } from '@/lib/useBadgeCount';
import type { Account, Dancer } from '@cdv/types';

interface AuthContextType {
  user: User | null;
  account: Account | null;
  dancers: Dancer[];
  loading: boolean;
  markMessagesAsRead?: (dancerId?: string) => Promise<void>;
  refreshBadge?: () => Promise<void>;
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

  // Pastille de l'icône = nombre de non-lus calculé par le serveur (même
  // règle que le champ `badge` des notifications). Avant, l'app la remettait
  // simplement à 0, et rien ne l'alimentait quand l'app était fermée.
  const refreshBadge = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const res = await httpsCallable<unknown, { count: number }>(functions, 'getMyBadgeCount')();
      const count = res.data?.count ?? 0;
      if (Platform.OS === 'android') {
        // Samsung (et autres lanceurs) : un chiffre fixé par l'app (ancien
        // compteur, via le broadcast BADGE_COUNT_UPDATE de ShortcutBadger)
        // remplace le nombre de notifications et reste figé. Or
        // setBadgeCountAsync(0) d'expo-notifications ne fait que vider le
        // tiroir sans jamais l'effacer. -1 passe, lui, par ShortcutBadger et
        // retire ce chiffre fixe : le lanceur revient au compte des
        // notifications du tiroir (qu'on nettoie à la lecture).
        await Notifications.setBadgeCountAsync(-1).catch(() => {});
        if (count === 0) await dismissAllPresented();
      } else {
        await Notifications.setBadgeCountAsync(count);
      }
    } catch (error) {
      console.error('[AuthContext] refreshBadge failed:', error);
    }
  }, []);

  // Au retour au premier plan : des messages ont pu être lus ailleurs (web,
  // autre téléphone) ou arriver pendant que l'app était en arrière-plan.
  useEffect(() => {
    if (!user) return;
    refreshBadge();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refreshBadge();
    });
    return () => sub.remove();
  }, [user?.uid, refreshBadge]);

  const markMessagesAsRead = async (dancerId?: string) => {
    try {
      if (dancerId) {
        const storageKey = `badge_last_visited_${dancerId}`;
        await AsyncStorage.setItem(storageKey, new Date().toISOString());
      }
      await refreshBadge();
    } catch (error) {
      console.error('[AuthContext] Error marking as read:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, account, dancers, loading, markMessagesAsRead, refreshBadge }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
