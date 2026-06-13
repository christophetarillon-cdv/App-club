import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Platform-agnostic: works in Next.js (web) and React Native (Expo)
// Each app imports this package and provides its own config via env vars

let app: FirebaseApp;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return app;
  }
  throw new Error(
    'Firebase not initialized. Call initFirebase() first in your app entry point.'
  );
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export function initFirebase(config: FirebaseConfig): FirebaseApp {
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return app;
  }
  app = initializeApp(config);
  return app;
}

export const getFirebaseAuth = () => getAuth(getFirebaseApp());
export const getFirebaseDb = () => getFirestore(getFirebaseApp());
export const getFirebaseStorage = () => getStorage(getFirebaseApp());
