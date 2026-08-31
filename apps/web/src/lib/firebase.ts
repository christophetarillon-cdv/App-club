// Ligne ajoutée intentionnellement pour forcer un nouveau build Vercel via git
// après correction du lockfile pnpm (rien à voir avec le code applicatif)
// — à retirer librement plus tard.
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;

// experimentalAutoDetectLongPolling : le transport WebChannel par defaut peut
// rester bloque indefiniment derriere certains reseaux/proxys au lieu
// d'echouer proprement — l'ecriture ne part jamais et il faut recharger la
// page. L'auto-detection bascule alors sur du long polling.
// initializeFirestore leve si Firestore est deja initialise (hot reload Next),
// d'ou le repli sur getFirestore.
function createDb() {
  try {
    return initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch {
    return getFirestore(app);
  }
}

export const db = createDb();
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west3');

// Base URL des Cloud Functions HTTP (onRequest) — pour celles non appelées
// via httpsCallable, ex. sendPasswordReset. Même helper que côté mobile
// (apps/mobile/src/lib/firebase.ts).
export const functionsBaseUrl = `https://europe-west3-${firebaseConfig.projectId}.cloudfunctions.net`;

// Utilisé pour afficher un repère visuel "DEV" quand le site n'est pas
// connecté aux vraies données (clubvoiron-prod) — voir app/layout.tsx.
// Même logique que le badge de l'app mobile (src/lib/firebase.ts).
export const isProdEnvironment = firebaseConfig.projectId === 'clubvoiron-prod';
