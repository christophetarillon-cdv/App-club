import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage, type Storage } from 'firebase-admin/storage';

function getAdminStorage(): Storage {
  if (!getApps().length) {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }
  return getStorage();
}

export const adminStorage = {
  bucket: () => getAdminStorage().bucket(),
};
