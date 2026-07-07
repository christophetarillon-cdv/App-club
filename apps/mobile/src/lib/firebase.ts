import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Valeurs par défaut = clubvoiron-dev, utilisées tant qu'aucune variable
// EXPO_PUBLIC_FIREBASE_* n'est définie dans le profil de build EAS (voir
// eas.json). Le jour où l'app bascule vers clubvoiron-prod, il suffira de
// renseigner ces variables dans le profil "production" d'eas.json — aucun
// changement de code nécessaire.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyDpKbSvSu5CM3wdoBhCyaZyEAGGbtPs9dQ',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'clubvoiron-dev.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'clubvoiron-dev',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'clubvoiron-dev.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '959510245510',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:959510245510:web:44e18876571434366aa107',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;

// initializeAuth throw si déjà initialisé (Fast Refresh) → fallback getAuth.
let _auth: Auth;
try {
  _auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  _auth = getAuth(app);
}

export const auth = _auth;
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west3');
