import { getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getClubProfileRef } from '@cdv/firebase';
import type { ClubProfile } from '@cdv/types';

export async function getClubProfile(): Promise<ClubProfile | null> {
  const snap = await getDoc(getClubProfileRef());
  if (!snap.exists()) return null;
  return snap.data() as ClubProfile;
}

export async function updateClubProfile(
  data: Partial<Omit<ClubProfile, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = getClubProfileRef();
  const snap = await getDoc(ref);
  await setDoc(
    ref,
    {
      ...data,
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp(), id: 'main' }),
    },
    { merge: true }
  );
}
