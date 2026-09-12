import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Production branch: clubvoiron-prod configuration hardcoded
export const firebaseConfig = {
  apiKey: 'AIzaSyCKIDFu3Ds2cJPgHiqVJdmQfZ3eGMOE71Q',
  authDomain: 'clubvoiron-prod.firebaseapp.com',
  projectId: 'clubvoiron-prod',
  storageBucket: 'clubvoiron-prod.firebasestorage.app',
  messagingSenderId: '556748254588',
  appId: '1:556748254588:web:28e35dc08d99d1657c08f9',
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

// Base URL des Cloud Functions HTTP (onRequest) — pour celles non appelées
// via httpsCallable, ex. sendPasswordReset. Même logique dev/prod que
// firebaseConfig ci-dessus : rien à changer au code lors du bascule.
export const functionsBaseUrl = `https://europe-west3-${firebaseConfig.projectId}.cloudfunctions.net`;

// Utilisé pour afficher un repère visuel "DEV" dans l'app quand elle n'est
// pas connectée aux vraies données (clubvoiron-prod) — voir app/_layout.tsx.
export const isProdEnvironment = firebaseConfig.projectId === 'clubvoiron-prod';
