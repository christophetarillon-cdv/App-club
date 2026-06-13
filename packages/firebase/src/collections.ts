import { collection, doc } from 'firebase/firestore';
import type { ClubProfile } from '@cdv/types';
import { getFirebaseDb } from './client';

// Typed Firestore collection/document references
// Platform-agnostic: firebase/firestore works in both web and React Native

export const collections = {
  clubProfile: () =>
    doc(getFirebaseDb(), 'clubProfile', 'main') as ReturnType<typeof doc>,
} as const;

// Convenience typed getter
export const getClubProfileRef = () =>
  doc(getFirebaseDb(), 'clubProfile', 'main');
