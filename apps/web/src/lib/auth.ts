import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  collection,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// ── Connexion ─────────────────────────────────────────────────────────────────

export const loginWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  const { user } = result;

  const ref = doc(db, 'accounts', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      isDancerToo: false,
      dancerIds: [],
      roles: [],
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return result;
};

export const logout = () => signOut(auth);

// ── Inscription membre (compte + premier danseur en une fois) ─────────────────

export interface SignUpOptions {
  phone?: string;
  marketingConsent?: boolean;
  imageRightsConsent?: boolean;
}

export const signUpWithEmail = async (
  displayName: string,
  firstName: string,
  lastName: string,
  email: string,
  password: string,
  options?: SignUpOptions,
) => {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  const dancerRef = doc(collection(db, 'dancers'));

  await Promise.all([
    setDoc(doc(db, 'accounts', user.uid), {
      uid: user.uid,
      email,
      displayName,
      isDancerToo: true,
      dancerIds: [dancerRef.id],
      roles: [],
      isActive: true,
      ...(options?.phone ? { phone: options.phone } : {}),
      ...(options?.marketingConsent !== undefined ? { marketingConsent: options.marketingConsent } : {}),
      ...(options?.imageRightsConsent !== undefined ? { imageRightsConsent: options.imageRightsConsent } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    setDoc(dancerRef, {
      accountId: user.uid,
      firstName,
      lastName,
      firstNameLower: firstName.toLowerCase(),
      lastNameLower: lastName.toLowerCase(),
      isMinor: false,
      roles: ['member'],
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  ]);

  return user;
};

// ── Inscription essai (compte + danseur en une fois) ──────────────────────────

export const signUpTrial = async (
  displayName: string,
  firstName: string,
  lastName: string,
  email: string,
  password: string,
  trialConfig: { mode: 'sessions' | 'days' | 'fixed'; maxSessions?: number; maxDays?: number; endDate?: string },
  options?: SignUpOptions,
) => {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);

  const dancerRef = doc(collection(db, 'dancers'));
  const trialExpiresAt = trialConfig.mode === 'days' && trialConfig.maxDays
    ? new Date(Date.now() + trialConfig.maxDays * 24 * 60 * 60 * 1000)
    : trialConfig.mode === 'fixed' && trialConfig.endDate
    ? new Date(trialConfig.endDate)
    : undefined;

  await Promise.all([
    setDoc(doc(db, 'accounts', user.uid), {
      uid: user.uid,
      email,
      displayName,
      isDancerToo: true,
      dancerIds: [dancerRef.id],
      roles: [],
      isActive: true,
      ...(options?.phone ? { phone: options.phone } : {}),
      ...(options?.marketingConsent !== undefined ? { marketingConsent: options.marketingConsent } : {}),
      ...(options?.imageRightsConsent !== undefined ? { imageRightsConsent: options.imageRightsConsent } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    setDoc(dancerRef, {
      accountId: user.uid,
      firstName,
      lastName,
      firstNameLower: firstName.toLowerCase(),
      lastNameLower: lastName.toLowerCase(),
      isMinor: false,
      roles: ['trial'],
      isActive: true,
      trialStartDate: serverTimestamp(),
      trialMode: trialConfig.mode,
      ...(trialExpiresAt ? { trialExpiresAt } : {}),
      ...(trialConfig.mode === 'sessions' ? { trialMaxSessions: trialConfig.maxSessions ?? 3 } : {}),
      trialSessionsUsed: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  ]);

  return { user, dancerId: dancerRef.id };
};

// ── Gestion des danseurs ──────────────────────────────────────────────────────

export interface CreateDancerInput {
  firstName: string;
  lastName: string;
  birthDate?: Date;
  isMinor?: boolean;
}

export const createDancer = async (accountId: string, input: CreateDancerInput) => {
  const dancerRef = doc(collection(db, 'dancers'));
  await setDoc(dancerRef, {
    accountId,
    firstName: input.firstName,
    lastName: input.lastName,
    firstNameLower: input.firstName.toLowerCase(),
    lastNameLower: input.lastName.toLowerCase(),
    isMinor: input.isMinor ?? false,
    ...(input.birthDate ? { birthDate: input.birthDate } : {}),
    roles: ['member'],
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'accounts', accountId), {
    dancerIds: arrayUnion(dancerRef.id),
    updatedAt: serverTimestamp(),
  });

  return dancerRef.id;
};

export interface SignUpOptions {
  phone?: string;
  marketingConsent?: boolean;
  imageRightsConsent?: boolean;
}

export interface UpdateDancerInput {
  firstName?: string;
  lastName?: string;
  birthDate?: Date;
  isMinor?: boolean;
  photoUrl?: string;
  phone?: string;
  address?: string;
  emergencyContact?: { name: string; phone: string };
  gender?: string;
  profession?: string;
  medicalNotes?: string;
  healthCertificate?: boolean;
}

export const updateDancer = async (dancerId: string, input: UpdateDancerInput) => {
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (input.firstName !== undefined) {
    updates.firstName = input.firstName;
    updates.firstNameLower = input.firstName.toLowerCase();
  }
  if (input.lastName !== undefined) {
    updates.lastName = input.lastName;
    updates.lastNameLower = input.lastName.toLowerCase();
  }
  if (input.birthDate !== undefined) updates.birthDate = input.birthDate;
  if (input.isMinor !== undefined) updates.isMinor = input.isMinor;
  if (input.photoUrl !== undefined) updates.photoUrl = input.photoUrl;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.address !== undefined) updates.address = input.address;
  if (input.emergencyContact !== undefined) updates.emergencyContact = input.emergencyContact;
  if (input.gender !== undefined) updates.gender = input.gender;
  if (input.profession !== undefined) updates.profession = input.profession;
  if (input.medicalNotes !== undefined) updates.medicalNotes = input.medicalNotes;
  if (input.healthCertificate !== undefined) updates.healthCertificate = input.healthCertificate;
  await updateDoc(doc(db, 'dancers', dancerId), updates);
};

export const deleteDancer = async (accountId: string, dancerId: string) => {
  await Promise.all([
    deleteDoc(doc(db, 'dancers', dancerId)),
    updateDoc(doc(db, 'accounts', accountId), {
      dancerIds: arrayRemove(dancerId),
      updatedAt: serverTimestamp(),
    }),
  ]);
};

// ── Inscription unifiée (welcome) — multi-danseurs, essai ou membre ───────────

export interface DancerInput {
  firstName: string;
  lastName: string;
}

export const signUpWithDancers = async (
  dancers: DancerInput[],
  email: string,
  password: string,
  type: 'member' | 'trial',
  config: { trialMode?: 'sessions' | 'days' | 'fixed'; trialMaxSessions?: number; trialMaxDays?: number; trialEndDate?: string; options?: SignUpOptions } = {},
) => {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);

  const first = dancers[0]!;
  const displayName = `${first.firstName.trim()} ${first.lastName.trim()}`.trim();
  const dancerRefs = dancers.map(() => doc(collection(db, 'dancers')));
  const trialExpiresAt = type === 'trial'
    ? config.trialMode === 'days' && config.trialMaxDays
      ? new Date(Date.now() + config.trialMaxDays * 24 * 60 * 60 * 1000)
      : config.trialMode === 'fixed' && config.trialEndDate
      ? new Date(config.trialEndDate)
      : undefined
    : undefined;

  await Promise.all([
    setDoc(doc(db, 'accounts', user.uid), {
      uid: user.uid,
      email,
      displayName,
      isDancerToo: true,
      dancerIds: dancerRefs.map(r => r.id),
      roles: [],
      isActive: true,
      ...(config.options?.phone ? { phone: config.options.phone } : {}),
      ...(config.options?.marketingConsent !== undefined ? { marketingConsent: config.options.marketingConsent } : {}),
      ...(config.options?.imageRightsConsent !== undefined ? { imageRightsConsent: config.options.imageRightsConsent } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    ...dancers.map((dancer, i) =>
      setDoc(dancerRefs[i]!, {
        accountId: user.uid,
        firstName: dancer.firstName.trim(),
        lastName: dancer.lastName.trim(),
        firstNameLower: dancer.firstName.trim().toLowerCase(),
        lastNameLower: dancer.lastName.trim().toLowerCase(),
        isMinor: false,
        roles: [type === 'trial' ? 'trial' : 'member'],
        isActive: true,
        ...(type === 'trial' ? {
          trialStartDate: serverTimestamp(),
          trialMode: config.trialMode ?? 'sessions',
          ...(trialExpiresAt ? { trialExpiresAt } : {}),
          ...((config.trialMode === 'sessions' || !config.trialMode) ? { trialMaxSessions: config.trialMaxSessions ?? 3 } : {}),
          trialSessionsUsed: 0,
        } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    ),
  ]);

  return { user, dancerIds: dancerRefs.map(r => r.id) };
};
