'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import {
  collection, getDocs, query, where, addDoc, doc, getDoc, updateDoc,
  deleteDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { AppShell } from '@/components/AppShell';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ProfileFieldsConfig, Dancer as FullDancer } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS } from '@cdv/types';
import {
  mergeProfileFieldsConfig, computeMissingAccountFields, computeMissingDancerFields,
} from '@/lib/profileFields';

const GENDER_OPTIONS = [
  { value: 'F', label: 'Femme' },
  { value: 'M', label: 'Homme' },
  { value: 'other', label: 'Autre' },
];

interface Dancer { id: string; firstName: string; lastName: string; accountEmail?: string; }
interface Season { id: string; label: string; }
interface PricingPlan { id: string; label: string; amount: number; conditions: string; seasonId: string; }

interface InstallmentDetail {
  id: string;
  amount: number;
  expectedDate: string;
  status: string;
  method: string;
  chequeNumber?: string;
  draweeBank?: string;
  draweeCity?: string;
}

interface MembershipEntry {
  id: string;
  dancerId?: string;
  dancerName?: string;
  planLabel?: string;
  paymentGroupId?: string;
  pricingPlanId: string;
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
  installments: InstallmentDetail[];
  status: string;
}

interface PaymentGroup {
  id: string;
  membershipIds: string[];
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installmentIds: string[];
  installments: InstallmentDetail[];
  dancers: { name: string; planLabel: string }[];
}

type PaymentMethod = 'cheque' | 'transfer' | 'cash' | 'helloasso';
type PayScope = 'me' | 'myAccount' | 'otherAccount';
type Step = 'who' | 'incomplete-profile' | 'plan';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces', helloasso: 'En ligne',
};

export default function MembershipPage() {
  const { user, account, dancers: fullDancers } = useAuth();
  const { selectedDancer } = useDancer();
  const router = useRouter();
  const searchParams = useSearchParams();
  const onlineStatus = searchParams.get('status');
  const [payingOnlineId, setPayingOnlineId] = useState<string | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [memberships, setMemberships] = useState<MembershipEntry[]>([]);
  const [paymentGroups, setPaymentGroups] = useState<PaymentGroup[]>([]);
  const [myDancers, setMyDancers] = useState<Dancer[]>([]);
  const [globalEnrolledIds, setGlobalEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [fieldConfig, setFieldConfig] = useState<ProfileFieldsConfig>(DEFAULT_PROFILE_FIELDS);

  // Creation flow
  const [step, setStep] = useState<Step>('who');
  const [payScope, setPayScope] = useState<PayScope>('me');
  const [selectedDancerIds, setSelectedDancerIds] = useState<Set<string>>(new Set());
  const [selectedOtherDancers, setSelectedOtherDancers] = useState<Dancer[]>([]);

  // Other account search
  const [otherSearch, setOtherSearch] = useState('');
  const [allOtherDancers, setAllOtherDancers] = useState<Dancer[]>([]);
  const [otherSearchResults, setOtherSearchResults] = useState<Dancer[]>([]);
  const otherSearchLoaded = useRef(false);

  // Plan selection (per dancer)
  const [selectedPlanIds, setSelectedPlanIds] = useState<Record<string, string>>({});
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('cheque');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Fiches complètes des danseurs d'autres comptes sélectionnés (pour
  // vérifier les champs obligatoires manquants).
  const [fullOtherDancersMap, setFullOtherDancersMap] = useState<Record<string, FullDancer>>({});
  useEffect(() => {
    const missingIds = selectedOtherDancers.map(d => d.id).filter(id => !fullOtherDancersMap[id]);
    if (missingIds.length === 0) return;
    Promise.all(missingIds.map(id => getDoc(doc(db, 'dancers', id)))).then(snaps => {
      setFullOtherDancersMap(prev => {
        const next = { ...prev };
        snaps.forEach(s => { if (s.exists()) next[s.id] = { id: s.id, ...s.data() } as FullDancer; });
        return next;
      });
    });
  }, [selectedOtherDancers]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
      const seasonsSnap = await getDocs(query(collection(db, 'seasons'), where('isActive', '==', true)));
      if (seasonsSnap.empty) { setLoading(false); return; }
      const activeSeason = { id: seasonsSnap.docs[0]!.id, label: seasonsSnap.docs[0]!.data().label as string };
      setSeason(activeSeason);

      const accSnap = await getDoc(doc(db, 'accounts', user.uid));
      let myDancersList: Dancer[] = [];
      if (accSnap.exists()) {
        const dancerIds: string[] = accSnap.data().dancerIds ?? [];
        const dancerDocs = await Promise.all(dancerIds.map(id => getDoc(doc(db, 'dancers', id))));
        myDancersList = dancerDocs
          .filter(d => d.exists())
          .map(d => ({ id: d.id, firstName: d.data()!.firstName ?? '', lastName: d.data()!.lastName ?? '' }));
        setMyDancers(myDancersList);
        if (myDancersList[0]) setSelectedDancerIds(new Set([myDancersList[0].id]));
      }

      const fetchEnrolled = async (): Promise<string[]> => {
        try {
          const idToken = await user.getIdToken();
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const r = await fetch(`/api/dancers/enrolled?seasonId=${activeSeason.id}`, {
            headers: { Authorization: `Bearer ${idToken}` },
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          const d = await r.json();
          return Array.isArray(d) ? d as string[] : [];
        } catch {
          return [];
        }
      };
      const [plansSnap, membershipSnap, groupsSnap, enrolledRes] = await Promise.all([
        getDocs(query(collection(db, 'pricingPlans'),
          where('seasonId', '==', activeSeason.id), where('isActive', '==', true))),
        getDocs(query(collection(db, 'memberships'),
          where('userId', '==', user.uid), where('seasonId', '==', activeSeason.id))),
        getDocs(query(collection(db, 'paymentGroups'),
          where('userId', '==', user.uid), where('seasonId', '==', activeSeason.id))),
        fetchEnrolled(),
      ]);
      setGlobalEnrolledIds(new Set(enrolledRes));

      const loadedPlans: PricingPlan[] = plansSnap.docs.map(d => ({
        id: d.id, label: d.data().label, amount: d.data().amount,
        conditions: d.data().conditions ?? '', seasonId: d.data().seasonId,
      }));
      setPlans(loadedPlans);

      const dancerMap = new Map(myDancersList.map(d => [d.id, d]));
      const loadedMemberships: MembershipEntry[] = await Promise.all(
        membershipSnap.docs.map(async md => {
          const data = md.data();
          let dancerName: string | undefined;
          const dancerId: string | undefined = data.dancerId;
          if (dancerId) {
            const dancer = dancerMap.get(dancerId);
            if (dancer) {
              dancerName = `${dancer.firstName} ${dancer.lastName}`.trim();
            } else {
              const ds = await getDoc(doc(db, 'dancers', dancerId));
              if (ds.exists()) dancerName = `${ds.data().firstName} ${ds.data().lastName}`.trim();
            }
          }
          let planLabel: string | undefined = loadedPlans.find(p => p.id === data.pricingPlanId)?.label;
          if (!planLabel && data.pricingPlanId) {
            const ps = await getDoc(doc(db, 'pricingPlans', data.pricingPlanId));
            if (ps.exists()) planLabel = ps.data().label;
          }
          return {
            id: md.id, dancerId, dancerName, planLabel,
            paymentGroupId: data.paymentGroupId,
            pricingPlanId: data.pricingPlanId,
            totalDue: data.totalDue, totalPaid: data.totalPaid,
            paymentMethod: data.paymentMethod, paymentPlanStatus: data.paymentPlanStatus,
            installmentIds: data.installmentIds ?? [], installments: [],
            status: data.status,
          };
        })
      );
      // Build payment groups with enriched dancer info
      const membershipById = new Map(loadedMemberships.map(m => [m.id, m]));
      const loadedGroups: Omit<PaymentGroup, 'installments'>[] = groupsSnap.docs.map(gd => {
        const data = gd.data();
        const membershipIds: string[] = data.membershipIds ?? [];
        const dancers = membershipIds.map(mid => {
          const m = membershipById.get(mid);
          return { name: m?.dancerName ?? '—', planLabel: m?.planLabel ?? '—' };
        });
        return {
          id: gd.id, membershipIds,
          totalDue: data.totalDue, totalPaid: data.totalPaid,
          paymentMethod: data.paymentMethod, paymentPlanStatus: data.paymentPlanStatus,
          installmentIds: data.installmentIds ?? [],
          dancers,
        };
      });

      // Load installment details for all memberships and groups
      const allInstallmentIds = [
        ...loadedMemberships.flatMap(m => m.installmentIds),
        ...loadedGroups.flatMap(g => g.installmentIds),
      ];
      const uniqueIds = [...new Set(allInstallmentIds)];
      const installmentMap = new Map<string, InstallmentDetail>();
      if (uniqueIds.length > 0) {
        const docs = await Promise.all(uniqueIds.map(id => getDoc(doc(db, 'paymentInstallments', id))));
        docs.forEach(d => {
          if (d.exists()) {
            const dd = d.data();
            installmentMap.set(d.id, {
              id: d.id,
              amount: dd.amount ?? 0,
              expectedDate: dd.expectedDate ?? '',
              status: dd.status ?? 'pending',
              method: dd.method ?? '',
              chequeNumber: dd.chequeNumber ?? undefined,
              draweeBank: dd.draweeBank ?? undefined,
              draweeCity: dd.draweeCity ?? undefined,
            });
          }
        });
      }

      const toInstallments = (ids: string[]) =>
        ids.map(id => installmentMap.get(id)).filter((x): x is InstallmentDetail => Boolean(x));

      setMemberships(loadedMemberships.map(m => ({ ...m, installments: toInstallments(m.installmentIds) })));
      setPaymentGroups(loadedGroups.map(g => ({ ...g, installments: toInstallments(g.installmentIds) })));

      const hasAnyMembership = loadedMemberships.length > 0 || loadedGroups.length > 0;
      if (!hasAnyMembership) setShowCreateForm(true);
      } catch (err) {
        console.error('Erreur chargement cotisation:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main')).then(snap => {
      if (snap.exists()) setFieldConfig(mergeProfileFieldsConfig(snap.data().profileFields));
    }).catch(() => {});
  }, []);

  const handlePayOnline = async (membershipId: string | null, groupId: string | null, amount: number) => {
    const id = (membershipId ?? groupId)!;
    setPayingOnlineId(id);
    try {
      const functions = getFunctions(getApp(), 'europe-west3');
      const createCheckout = httpsCallable<
        { membershipId?: string; groupId?: string; amount: number },
        { redirectUrl: string }
      >(functions, 'createHelloAssoCheckout');
      const result = await createCheckout({
        ...(membershipId ? { membershipId } : { groupId: groupId! }),
        amount,
      });
      window.location.href = result.data.redirectUrl;
    } catch (err) {
      console.error('Erreur paiement en ligne:', err);
      alert('Erreur lors de la création du paiement. Veuillez réessayer.');
      setPayingOnlineId(null);
    }
  };

  // Load all other dancers when "autre compte" is selected
  const loadOtherDancers = async () => {
    if (otherSearchLoaded.current) return;
    otherSearchLoaded.current = true;
    const dancerSnap = await getDocs(collection(db, 'dancers'));
    const myIds = new Set(myDancers.map(d => d.id));
    const others: Dancer[] = dancerSnap.docs
      .filter(d => !myIds.has(d.id) && !globalEnrolledIds.has(d.id))
      .map(d => ({
        id: d.id,
        firstName: d.data().firstName ?? '',
        lastName: d.data().lastName ?? '',
      }));
    setAllOtherDancers(others);
  };

  useEffect(() => {
    if (payScope !== 'otherAccount' || otherSearch.length < 2) {
      setOtherSearchResults([]);
      return;
    }
    const lower = otherSearch.toLowerCase();
    const alreadySelectedIds = new Set(selectedOtherDancers.map(d => d.id));
    setOtherSearchResults(
      allOtherDancers
        .filter(d => !alreadySelectedIds.has(d.id) &&
          `${d.firstName} ${d.lastName}`.toLowerCase().includes(lower))
        .slice(0, 6)
    );
  }, [otherSearch, allOtherDancers, payScope, selectedOtherDancers]);

  const handlePayScopeChange = (scope: PayScope) => {
    setPayScope(scope);
    if (scope === 'me') {
      if (myDancers[0]) setSelectedDancerIds(new Set([myDancers[0].id]));
    } else if (scope === 'myAccount') {
      setSelectedDancerIds(new Set(myDancers.map(d => d.id)));
    } else {
      if (myDancers[0]) setSelectedDancerIds(new Set([myDancers[0].id]));
      loadOtherDancers();
    }
  };

  const toggleMyDancer = (id: string) => {
    setSelectedDancerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      if (next.size === 0 && myDancers[0]) next.add(myDancers[0].id);
      return next;
    });
  };

  const addOtherDancer = (dancer: Dancer) => {
    setSelectedOtherDancers(prev =>
      prev.find(d => d.id === dancer.id) ? prev : [...prev, dancer]
    );
    setOtherSearch('');
  };

  const alreadyEnrolledIds = globalEnrolledIds;

  const allSelectedDancers: Dancer[] = [
    ...myDancers.filter(d => selectedDancerIds.has(d.id)),
    ...selectedOtherDancers,
  ];
  const dancersToCreate = allSelectedDancers.filter(d => !alreadyEnrolledIds.has(d.id));

  // ── Vérification fiche d'identité complète ────────────────────────────────
  // Danseurs de mon compte (+ n'importe quel danseur si je suis admin/bureau)
  // : je peux éditer leur fiche, donc on demande de compléter directement
  // dans le déroulé. Danseurs d'un autre compte sans droits : la cotisation
  // se crée quand même, mais leur fiche est marquée pour que leur titulaire
  // soit obligé de la compléter à sa prochaine connexion.
  const isAdmin = (selectedDancer?.roles.includes('admin') ?? false) || (account?.roles?.includes('admin') ?? false);

  const editableSelectedDancers = allSelectedDancers.filter(d => {
    const full = fullDancers.find(fd => fd.id === d.id) ?? fullOtherDancersMap[d.id];
    return isAdmin || (full ? full.accountId === user?.uid : true);
  });
  const nonEditableSelectedDancers = allSelectedDancers.filter(d => !editableSelectedDancers.includes(d));

  const accountMissing = editableSelectedDancers.some(d => fullDancers.some(fd => fd.id === d.id))
    ? computeMissingAccountFields(account, fieldConfig)
    : [];

  const dancersMissing = editableSelectedDancers
    .map(d => ({ dancer: d, full: fullDancers.find(fd => fd.id === d.id) ?? fullOtherDancersMap[d.id] }))
    .filter((x): x is { dancer: Dancer; full: FullDancer } => !!x.full)
    .map(x => ({ ...x, fields: computeMissingDancerFields(x.full, fieldConfig) }))
    .filter(x => x.fields.length > 0);

  const nonEditableMissing = nonEditableSelectedDancers
    .map(d => ({ dancer: d, full: fullOtherDancersMap[d.id] }))
    .filter((x): x is { dancer: Dancer; full: FullDancer } => !!x.full)
    .map(x => ({ ...x, fields: computeMissingDancerFields(x.full, fieldConfig) }))
    .filter(x => x.fields.length > 0);

  const hasIncompleteEditableProfile = accountMissing.length > 0 || dancersMissing.length > 0;

  // ── Formulaire de complétion (Option A : une seule page consolidée) ──────
  const [profileForm, setProfileForm] = useState<Record<string, string | boolean>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const setFormValue = (key: string, value: string | boolean) => setProfileForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (step !== 'incomplete-profile') return;
    setProfileForm(prev => {
      const next = { ...prev };
      if (accountMissing.length > 0 && account) {
        if (next['account.phone'] === undefined) next['account.phone'] = account.phone ?? '';
        if (next['account.marketingConsent'] === undefined) next['account.marketingConsent'] = account.marketingConsent ?? false;
        if (next['account.imageRightsConsent'] === undefined) next['account.imageRightsConsent'] = account.imageRightsConsent ?? false;
      }
      for (const { dancer, full } of dancersMissing) {
        const p = dancer.id;
        if (next[`${p}.street`] === undefined) next[`${p}.street`] = full.street ?? '';
        if (next[`${p}.postalCode`] === undefined) next[`${p}.postalCode`] = full.postalCode ?? '';
        if (next[`${p}.city`] === undefined) next[`${p}.city`] = full.city ?? '';
        if (next[`${p}.profession`] === undefined) next[`${p}.profession`] = full.profession ?? '';
        if (next[`${p}.medicalNotes`] === undefined) next[`${p}.medicalNotes`] = full.medicalNotes ?? '';
        if (next[`${p}.gender`] === undefined) next[`${p}.gender`] = full.gender ?? '';
        if (next[`${p}.birthDate`] === undefined) {
          next[`${p}.birthDate`] = full.birthDate
            ? new Date(full.birthDate.seconds * 1000).toISOString().slice(0, 10)
            : '';
        }
        if (next[`${p}.healthCertificate`] === undefined) next[`${p}.healthCertificate`] = full.healthCertificate ?? false;
        if (next[`${p}.emergencyName`] === undefined) next[`${p}.emergencyName`] = full.emergencyContact?.name ?? '';
        if (next[`${p}.emergencyPhone`] === undefined) next[`${p}.emergencyPhone`] = full.emergencyContact?.phone ?? '';
      }
      return next;
    });
  }, [step]);

  const isFieldMissingValue = (key: string, fieldKey: string): boolean => {
    const v = profileForm[key];
    if (fieldKey === 'healthCertificate' || fieldKey === 'marketingConsent' || fieldKey === 'imageRightsConsent') {
      return v !== true;
    }
    return !(typeof v === 'string' && v.trim());
  };

  const profileFormValid = (): boolean => {
    if (accountMissing.some(f => isFieldMissingValue(`account.${f.key}`, f.key))) return false;
    for (const { dancer, fields } of dancersMissing) {
      for (const f of fields) {
        if (f.key === 'emergencyContact') {
          if (!(profileForm[`${dancer.id}.emergencyName`] as string)?.trim() || !(profileForm[`${dancer.id}.emergencyPhone`] as string)?.trim()) return false;
        } else if (f.key === 'gender') {
          if (!profileForm[`${dancer.id}.gender`]) return false;
        } else if (isFieldMissingValue(`${dancer.id}.${f.key}`, f.key)) {
          return false;
        }
      }
    }
    return true;
  };

  const handleSaveProfileForm = async () => {
    if (!profileFormValid() || !user) return;
    setSavingProfile(true);
    try {
      const writes: Promise<unknown>[] = [];

      if (accountMissing.length > 0) {
        const accountUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (accountMissing.some(f => f.key === 'phone')) accountUpdates.phone = (profileForm['account.phone'] as string).trim();
        if (accountMissing.some(f => f.key === 'marketingConsent')) accountUpdates.marketingConsent = !!profileForm['account.marketingConsent'];
        if (accountMissing.some(f => f.key === 'imageRightsConsent')) accountUpdates.imageRightsConsent = !!profileForm['account.imageRightsConsent'];
        writes.push(updateDoc(doc(db, 'accounts', user.uid), accountUpdates));
      }

      for (const { dancer, fields } of dancersMissing) {
        const p = dancer.id;
        const dancerUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
        for (const f of fields) {
          if (f.key === 'street') dancerUpdates.street = (profileForm[`${p}.street`] as string).trim();
          if (f.key === 'postalCode') dancerUpdates.postalCode = (profileForm[`${p}.postalCode`] as string).trim();
          if (f.key === 'city') dancerUpdates.city = (profileForm[`${p}.city`] as string).trim();
          if (f.key === 'profession') dancerUpdates.profession = (profileForm[`${p}.profession`] as string).trim();
          if (f.key === 'medicalNotes') dancerUpdates.medicalNotes = (profileForm[`${p}.medicalNotes`] as string).trim();
          if (f.key === 'gender') dancerUpdates.gender = profileForm[`${p}.gender`];
          if (f.key === 'healthCertificate') dancerUpdates.healthCertificate = !!profileForm[`${p}.healthCertificate`];
          if (f.key === 'emergencyContact') {
            dancerUpdates.emergencyContact = {
              name: (profileForm[`${p}.emergencyName`] as string).trim(),
              phone: (profileForm[`${p}.emergencyPhone`] as string).trim(),
            };
          }
          if (f.key === 'birthDate') {
            const iso = profileForm[`${p}.birthDate`] as string;
            if (iso) dancerUpdates.birthDate = new Date(iso + 'T00:00:00');
          }
        }
        writes.push(updateDoc(doc(db, 'dancers', p), dancerUpdates));
      }

      await Promise.all(writes);

      if (plans.length === 1) {
        const pre: Record<string, string> = {};
        dancersToCreate.forEach(d => { pre[d.id] = plans[0]!.id; });
        setSelectedPlanIds(pre);
      }
      setStep('plan');
    } catch {
      alert("Impossible d'enregistrer les informations.");
    } finally {
      setSavingProfile(false);
    }
  };

  const resetCreateForm = () => {
    setStep('who');
    setPayScope('me');
    if (myDancers[0]) setSelectedDancerIds(new Set([myDancers[0].id]));
    setSelectedOtherDancers([]);
    setOtherSearch('');
    setSelectedPlanIds({});
    setSelectedMethod('cheque');
  };

  const allPlansFilled = dancersToCreate.length > 0 &&
    dancersToCreate.every(d => Boolean(selectedPlanIds[d.id]));

  const handleCreate = async () => {
    if (!user || !season || !allPlansFilled) return;
    setSubmitting(true);
    setCreateError(null);

    // Danseurs d'un autre compte dont la fiche est incomplète et que je
    // n'ai pas le droit d'éditer : leur titulaire devra compléter à sa
    // prochaine connexion (best-effort, ne bloque pas la cotisation).
    if (nonEditableMissing.length > 0) {
      const flagFn = httpsCallable(getFunctions(getApp(), 'europe-west3'), 'flagProfileCompletion');
      Promise.all(nonEditableMissing.map(x => flagFn({ dancerId: x.dancer.id }))).catch(() => {});
    }

    try {
      if (dancersToCreate.length === 1) {
        const dancer = dancersToCreate[0]!;
        const planId = selectedPlanIds[dancer.id]!;
        const plan = plans.find(p => p.id === planId)!;
        const ref = await addDoc(collection(db, 'memberships'), {
          userId: user.uid,
          dancerId: dancer.id,
          seasonId: season.id,
          pricingPlanId: planId,
          totalDue: plan.amount,
          totalPaid: 0,
          paymentMethod: selectedMethod,
          paymentPlanStatus: 'pending',
          installmentIds: [],
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (selectedMethod === 'helloasso') {
          await handlePayOnline(ref.id, null, plan.amount);
        } else {
          window.location.href = `/membership/payment-plan?membershipId=${ref.id}`;
        }
      } else {
        // Pre-generate group ref so memberships can include paymentGroupId at create time
        const groupRef = doc(collection(db, 'paymentGroups'));
        const batch = writeBatch(db);
        const membershipIds: string[] = [];

        for (const dancer of dancersToCreate) {
          const planId = selectedPlanIds[dancer.id]!;
          const plan = plans.find(p => p.id === planId)!;
          const mRef = doc(collection(db, 'memberships'));
          membershipIds.push(mRef.id);
          batch.set(mRef, {
            userId: user.uid,
            dancerId: dancer.id,
            seasonId: season.id,
            pricingPlanId: planId,
            totalDue: plan.amount,
            totalPaid: 0,
            paymentMethod: selectedMethod,
            paymentPlanStatus: 'pending',
            installmentIds: [],
            status: 'pending',
            paymentGroupId: groupRef.id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const totalDue = dancersToCreate.reduce((sum, dancer) => {
          const planId = selectedPlanIds[dancer.id]!;
          return sum + (plans.find(p => p.id === planId)?.amount ?? 0);
        }, 0);

        batch.set(groupRef, {
          userId: user.uid,
          membershipIds,
          totalDue,
          totalPaid: 0,
          paymentMethod: selectedMethod,
          paymentPlanStatus: 'pending',
          installmentIds: [],
          seasonId: season.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await batch.commit();
        if (selectedMethod === 'helloasso') {
          await handlePayOnline(null, groupRef.id, totalDue);
        } else {
          window.location.href = `/membership/payment-plan?groupId=${groupRef.id}`;
        }
      }
    } catch (err: unknown) {
      console.error('Erreur création cotisation:', err);
      setCreateError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="max-w-xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold text-gray-900 mb-5">Ma cotisation</h1>

        {onlineStatus === 'success' && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-2xl p-4 text-green-800 text-sm font-medium">
            Paiement en ligne reçu. Votre cotisation sera mise à jour sous quelques instants.
          </div>
        )}
        {onlineStatus === 'error' && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-800 text-sm font-medium">
            Le paiement n'a pas pu être traité. Veuillez réessayer ou contacter le club.
          </div>
        )}

        {!season && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400">Aucune saison active pour le moment.</p>
          </div>
        )}

        {season && (
          <div className="space-y-4">
            {/* Solo memberships (not part of a group) */}
            {memberships.filter(m => !m.paymentGroupId).map(m => (
              <MembershipCard
                key={m.id}
                membership={m}
                season={season}
                payingOnline={payingOnlineId === m.id}
                onPayOnline={(amount) => handlePayOnline(m.id, null, amount)}
                onCancel={async () => {
                  if (!confirm('Annuler cette cotisation ? Cette action est irréversible.')) return;
                  await deleteDoc(doc(db, 'memberships', m.id));
                  setMemberships(prev => prev.filter(x => x.id !== m.id));
                }}
              />
            ))}

            {/* Payment groups */}
            {paymentGroups.map(group => (
              <GroupMembershipCard
                key={group.id}
                group={group}
                season={season}
                payingOnline={payingOnlineId === group.id}
                onPayOnline={(amount) => handlePayOnline(null, group.id, amount)}
                onCancel={async () => {
                  if (!confirm('Annuler toutes les cotisations de ce groupe ? Cette action est irréversible.')) return;
                  const batch = writeBatch(db);
                  for (const mId of group.membershipIds) batch.delete(doc(db, 'memberships', mId));
                  batch.delete(doc(db, 'paymentGroups', group.id));
                  await batch.commit();
                  setPaymentGroups(prev => prev.filter(g => g.id !== group.id));
                  setMemberships(prev => prev.filter(m => !group.membershipIds.includes(m.id)));
                }}
              />
            ))}

            {/* Create form toggle */}
            {(memberships.length > 0 || paymentGroups.length > 0) && !showCreateForm && (
              <button
                onClick={() => { resetCreateForm(); setShowCreateForm(true); }}
                className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-4 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                + Ajouter une cotisation pour un autre danseur
              </button>
            )}

            {/* Creation form */}
            {showCreateForm && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800">
                    {memberships.length === 0 ? `Saison ${season.label}` : 'Nouvelle cotisation'}
                  </h2>
                  {memberships.length > 0 && (
                    <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                  )}
                </div>

                {/* Step 0: Who */}
                {step === 'who' && (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-3">Pour qui souhaitez-vous créer une cotisation ?</p>
                      <div className="space-y-2">
                        {/* Me only */}
                        <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${payScope === 'me' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input type="radio" name="scope" checked={payScope === 'me'} onChange={() => handlePayScopeChange('me')} className="mt-0.5" />
                          <div>
                            <p className="font-medium text-gray-900">Pour moi seul(e)</p>
                            {myDancers[0] && (
                              <p className="text-sm text-gray-500">{myDancers[0].firstName} {myDancers[0].lastName}</p>
                            )}
                          </div>
                        </label>

                        {/* Multiple dancers from my account */}
                        {myDancers.length > 1 && (
                          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${payScope === 'myAccount' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                            <input type="radio" name="scope" checked={payScope === 'myAccount'} onChange={() => handlePayScopeChange('myAccount')} className="mt-0.5" />
                            <div>
                              <p className="font-medium text-gray-900">Plusieurs danseurs de mon compte</p>
                              <p className="text-sm text-gray-500">{myDancers.map(d => `${d.firstName} ${d.lastName}`).join(', ')}</p>
                            </div>
                          </label>
                        )}

                        {/* Other account */}
                        <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${payScope === 'otherAccount' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input type="radio" name="scope" checked={payScope === 'otherAccount'} onChange={() => handlePayScopeChange('otherAccount')} className="mt-0.5" />
                          <div>
                            <p className="font-medium text-gray-900">Moi + danseurs d'un autre compte</p>
                            <p className="text-sm text-gray-500">Payer pour des danseurs d'un autre compte</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Dancer checkboxes for myAccount */}
                    {payScope === 'myAccount' && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sélectionnez les danseurs</p>
                        {myDancers.map(dancer => {
                          const enrolled = alreadyEnrolledIds.has(dancer.id);
                          return (
                            <label key={dancer.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${enrolled ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed' : selectedDancerIds.has(dancer.id) ? 'border-blue-500 bg-blue-50 cursor-pointer' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'}`}>
                              <input type="checkbox" checked={selectedDancerIds.has(dancer.id)} onChange={() => !enrolled && toggleMyDancer(dancer.id)} disabled={enrolled} className="mt-0.5" />
                              <span className="font-medium text-gray-900 flex-1">{dancer.firstName} {dancer.lastName}</span>
                              {enrolled && <span className="text-xs text-green-600 font-medium">Déjà inscrit(e)</span>}
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Other account search */}
                    {payScope === 'otherAccount' && (
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mes danseurs</p>
                          {myDancers.map(dancer => {
                            const enrolled = alreadyEnrolledIds.has(dancer.id);
                            return (
                              <label key={dancer.id} className={`flex items-center gap-3 p-3 rounded-xl border mb-1.5 transition-colors ${enrolled ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed' : selectedDancerIds.has(dancer.id) ? 'border-blue-500 bg-blue-50 cursor-pointer' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'}`}>
                                <input type="checkbox" checked={selectedDancerIds.has(dancer.id)} onChange={() => !enrolled && toggleMyDancer(dancer.id)} disabled={enrolled} />
                                <span className="font-medium text-gray-900 flex-1">{dancer.firstName} {dancer.lastName}</span>
                                {enrolled && <span className="text-xs text-green-600 font-medium">Déjà inscrit(e)</span>}
                              </label>
                            );
                          })}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rechercher un danseur d'un autre compte</p>
                          <div className="relative">
                            <input
                              type="text"
                              value={otherSearch}
                              onChange={e => setOtherSearch(e.target.value)}
                              placeholder="Rechercher par prénom nom ou email…"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                            {otherSearchResults.length > 0 && (
                              <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                                {otherSearchResults.map(d => (
                                  <button key={d.id} type="button" onClick={() => addOtherDancer(d)}
                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50">
                                    <span className="font-medium text-gray-900">{d.firstName} {d.lastName}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {selectedOtherDancers.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {selectedOtherDancers.map(d => (
                                <div key={d.id} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
                                  <span className="font-medium text-gray-900">{d.firstName} {d.lastName}</span>
                                  <button type="button" onClick={() => setSelectedOtherDancers(prev => prev.filter(x => x.id !== d.id))}
                                    className="text-red-400 hover:text-red-600 font-bold ml-2">✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setStep(hasIncompleteEditableProfile ? 'incomplete-profile' : 'plan')}
                      disabled={dancersToCreate.length === 0}
                      className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"
                    >
                      Continuer →
                    </button>
                  </>
                )}

                {/* Step intermédiaire : profil incomplet (Option A, page consolidée) */}
                {step === 'incomplete-profile' && (
                  <>
                    <button onClick={() => setStep('who')} className="text-sm text-gray-400 hover:text-gray-600">
                      ← Retour
                    </button>
                    <p className="text-sm text-gray-600">
                      Merci de compléter les informations manquantes avant de choisir une cotisation.
                    </p>

                    {nonEditableMissing.length > 0 && (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                        <p className="text-sm text-orange-800">
                          ⚠️ {nonEditableMissing.map(x => `${x.dancer.firstName} ${x.dancer.lastName}`).join(', ')}
                          {nonEditableMissing.length > 1 ? ' ont' : ' a'} une fiche incomplète, mais vous n'avez pas
                          les droits pour la modifier. La cotisation sera quand même créée ; leur titulaire de
                          compte devra compléter sa fiche à sa prochaine connexion.
                        </p>
                      </div>
                    )}

                    {accountMissing.length > 0 && (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                        <p className="font-semibold text-gray-900 text-sm">Mes informations de compte</p>
                        {accountMissing.some(f => f.key === 'phone') && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Téléphone</label>
                            <input type="tel" value={profileForm['account.phone'] as string ?? ''}
                              onChange={e => setFormValue('account.phone', e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                          </div>
                        )}
                        {accountMissing.some(f => f.key === 'marketingConsent') && (
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={!!profileForm['account.marketingConsent']}
                              onChange={e => setFormValue('account.marketingConsent', e.target.checked)}
                              className="mt-0.5 w-4 h-4 rounded" />
                            <span className="text-xs text-gray-600">J'accepte de recevoir des communications marketing du club.</span>
                          </label>
                        )}
                        {accountMissing.some(f => f.key === 'imageRightsConsent') && (
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={!!profileForm['account.imageRightsConsent']}
                              onChange={e => setFormValue('account.imageRightsConsent', e.target.checked)}
                              className="mt-0.5 w-4 h-4 rounded" />
                            <span className="text-xs text-gray-600">J'autorise le club à utiliser mon image (photos/vidéos).</span>
                          </label>
                        )}
                      </div>
                    )}

                    {dancersMissing.map(({ dancer, fields }) => (
                      <div key={dancer.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                        <p className="font-semibold text-gray-900 text-sm">{dancer.firstName} {dancer.lastName}</p>
                        {fields.some(f => f.key === 'birthDate') && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date de naissance</label>
                            <input type="date" value={profileForm[`${dancer.id}.birthDate`] as string ?? ''}
                              onChange={e => setFormValue(`${dancer.id}.birthDate`, e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                          </div>
                        )}
                        {fields.some(f => f.key === 'gender') && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Genre</label>
                            <div className="flex gap-2">
                              {GENDER_OPTIONS.map(opt => (
                                <button key={opt.value} type="button"
                                  onClick={() => setFormValue(`${dancer.id}.gender`, opt.value)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                                    profileForm[`${dancer.id}.gender`] === opt.value
                                      ? 'bg-blue-600 border-blue-600 text-white'
                                      : 'bg-white border-gray-300 text-gray-700'
                                  }`}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {fields.some(f => f.key === 'street') && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Rue</label>
                            <input type="text" value={profileForm[`${dancer.id}.street`] as string ?? ''}
                              onChange={e => setFormValue(`${dancer.id}.street`, e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                          </div>
                        )}
                        {fields.some(f => f.key === 'postalCode') && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Code postal</label>
                            <input type="text" value={profileForm[`${dancer.id}.postalCode`] as string ?? ''}
                              onChange={e => setFormValue(`${dancer.id}.postalCode`, e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                          </div>
                        )}
                        {fields.some(f => f.key === 'city') && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ville</label>
                            <input type="text" value={profileForm[`${dancer.id}.city`] as string ?? ''}
                              onChange={e => setFormValue(`${dancer.id}.city`, e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                          </div>
                        )}
                        {fields.some(f => f.key === 'profession') && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Profession</label>
                            <input type="text" value={profileForm[`${dancer.id}.profession`] as string ?? ''}
                              onChange={e => setFormValue(`${dancer.id}.profession`, e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                          </div>
                        )}
                        {fields.some(f => f.key === 'emergencyContact') && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contact d'urgence — nom</label>
                              <input type="text" value={profileForm[`${dancer.id}.emergencyName`] as string ?? ''}
                                onChange={e => setFormValue(`${dancer.id}.emergencyName`, e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Téléphone</label>
                              <input type="tel" value={profileForm[`${dancer.id}.emergencyPhone`] as string ?? ''}
                                onChange={e => setFormValue(`${dancer.id}.emergencyPhone`, e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                            </div>
                          </div>
                        )}
                        {fields.some(f => f.key === 'medicalNotes') && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes médicales</label>
                            <textarea value={profileForm[`${dancer.id}.medicalNotes`] as string ?? ''}
                              onChange={e => setFormValue(`${dancer.id}.medicalNotes`, e.target.value)} rows={2}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
                          </div>
                        )}
                        {fields.some(f => f.key === 'healthCertificate') && (
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={!!profileForm[`${dancer.id}.healthCertificate`]}
                              onChange={e => setFormValue(`${dancer.id}.healthCertificate`, e.target.checked)}
                              className="mt-0.5 w-4 h-4 rounded" />
                            <span className="text-xs text-gray-600">Certificat médical fourni</span>
                          </label>
                        )}
                      </div>
                    ))}

                    <button
                      onClick={handleSaveProfileForm}
                      disabled={!profileFormValid() || savingProfile}
                      className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"
                    >
                      {savingProfile ? 'Enregistrement…' : 'Continuer →'}
                    </button>
                  </>
                )}

                {/* Step 1: Plan per dancer + method */}
                {step === 'plan' && (
                  <>
                    {plans.length === 0 && (
                      <p className="text-sm text-gray-400">Aucun tarif disponible pour cette saison.</p>
                    )}

                    <div className="space-y-5">
                      {dancersToCreate.map(dancer => (
                        <div key={dancer.id}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            {dancer.firstName} {dancer.lastName}
                          </p>
                          <div className="space-y-2">
                            {plans.map(p => {
                              const checked = selectedPlanIds[dancer.id] === p.id;
                              return (
                                <label key={p.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                                  <input
                                    type="radio"
                                    name={`plan-${dancer.id}`}
                                    value={p.id}
                                    checked={checked}
                                    onChange={() => setSelectedPlanIds(prev => ({ ...prev, [dancer.id]: p.id }))}
                                    className="mt-0.5"
                                  />
                                  <div className="flex-1">
                                    <p className="font-medium text-gray-900">{p.label}</p>
                                    <p className="text-sm font-semibold text-blue-700">{(p.amount / 100).toFixed(2)} €</p>
                                    {p.conditions && <p className="text-xs text-gray-500 mt-0.5">{p.conditions}</p>}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {allPlansFilled && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mode de paiement</p>
                        <div className="flex gap-2 flex-wrap">
                          {(['cheque', 'transfer', 'cash'] as PaymentMethod[]).map(m => (
                            <button key={m} type="button" onClick={() => setSelectedMethod(m)}
                              className={`text-sm px-4 py-2 rounded-lg font-medium border transition-colors ${selectedMethod === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                              {METHOD_LABEL[m]}
                            </button>
                          ))}
                          <button type="button" onClick={() => setSelectedMethod('helloasso')}
                            className={`text-sm px-4 py-2 rounded-lg font-medium border transition-colors ${selectedMethod === 'helloasso' ? 'bg-green-700 text-white border-green-700' : 'bg-white text-green-700 border-green-400 hover:bg-green-50'}`}>
                            En ligne ↗
                          </button>
                        </div>
                      </div>
                    )}

                    {createError && (
                      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>
                    )}

                    <div className="flex gap-3">
                      <button onClick={() => setStep('who')}
                        className="flex-1 bg-gray-100 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-200 text-sm transition-colors">
                        ← Retour
                      </button>
                      <button onClick={handleCreate} disabled={!allPlansFilled || submitting}
                        className="flex-[2] bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
                        {submitting ? 'Création…' : dancersToCreate.length > 1 ? `Créer les ${dancersToCreate.length} cotisations` : 'Créer la cotisation'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MembershipCard({ membership, season, payingOnline, onPayOnline, onCancel }: {
  membership: MembershipEntry;
  season: Season;
  payingOnline: boolean;
  onPayOnline: (amount: number) => void;
  onCancel: () => Promise<void>;
}) {
  const METHOD_LABEL: Record<string, string> = {
    cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start justify-between">
        <div>
          {membership.dancerName && (
            <p className="text-xs font-semibold text-blue-600 mb-0.5">{membership.dancerName}</p>
          )}
          <h2 className="font-semibold text-gray-800">{membership.planLabel ?? 'Cotisation'}</h2>
          <p className="text-xs text-gray-400 mt-0.5">Saison {season.label}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          membership.status === 'active' ? 'bg-green-100 text-green-700' :
          membership.status === 'complete' ? 'bg-blue-100 text-blue-700' :
          'bg-orange-100 text-orange-700'
        }`}>
          {membership.status === 'active' ? 'Active' : membership.status === 'complete' ? 'Soldée' : 'En attente'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-400 text-xs">Total dû</p>
          <p className="font-semibold text-gray-900">{(membership.totalDue / 100).toFixed(2)} €</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Total encaissé</p>
          <p className={`font-semibold ${membership.totalPaid >= membership.totalDue ? 'text-green-700' : 'text-gray-900'}`}>
            {(membership.totalPaid / 100).toFixed(2)} €
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Mode de paiement</p>
          <p className="font-medium text-gray-700">{METHOD_LABEL[membership.paymentMethod] ?? membership.paymentMethod}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Plan de paiement</p>
          <p className={`font-medium ${
            membership.paymentPlanStatus === 'approved' ? 'text-green-700' :
            membership.paymentPlanStatus === 'rejected' ? 'text-red-600' : 'text-orange-600'
          }`}>
            {membership.paymentPlanStatus === 'approved' ? 'Approuvé' :
             membership.paymentPlanStatus === 'rejected' ? 'Refusé' : 'En attente'}
          </p>
        </div>
      </div>

      {membership.installments.length > 0 && (
        <InstallmentsTable installments={membership.installments} method={membership.paymentMethod} />
      )}

      {membership.paymentPlanStatus === 'pending' && membership.installmentIds.length === 0 && (
        <div className="mt-4 space-y-2">
          {membership.totalDue > membership.totalPaid && (
            <button
              onClick={() => onPayOnline(membership.totalDue - membership.totalPaid)}
              disabled={payingOnline}
              className="w-full bg-green-600 text-white font-semibold py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm transition-colors"
            >
              {payingOnline ? 'Redirection…' : 'Payer en ligne ↗'}
            </button>
          )}
          <div className="flex gap-2">
            <Link href={`/membership/payment-plan?membershipId=${membership.id}`}
              className="flex-[3] block text-center bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 text-sm transition-colors">
              Proposer un plan de paiement →
            </Link>
            <button onClick={onCancel}
              className="flex-1 text-sm font-medium text-red-500 border border-red-200 rounded-lg py-2.5 hover:bg-red-50 transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}
      {membership.paymentPlanStatus === 'rejected' && (
        <Link href={`/membership/payment-plan?membershipId=${membership.id}`}
          className="block w-full text-center mt-4 bg-orange-600 text-white font-semibold py-2.5 rounded-lg hover:bg-orange-700 text-sm transition-colors">
          Modifier le plan de paiement →
        </Link>
      )}
    </div>
  );
}

function GroupMembershipCard({ group, season, payingOnline, onPayOnline, onCancel }: {
  group: PaymentGroup;
  season: Season;
  payingOnline: boolean;
  onPayOnline: (amount: number) => void;
  onCancel: () => Promise<void>;
}) {
  const METHOD_LABEL: Record<string, string> = {
    cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces',
  };
  const statusLabel = group.paymentPlanStatus === 'approved' ? 'Approuvé' :
    group.paymentPlanStatus === 'rejected' ? 'Refusé' : 'En attente';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-semibold text-gray-800">Cotisations groupées</h2>
          <p className="text-xs text-gray-400 mt-0.5">Saison {season.label}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          group.paymentPlanStatus === 'approved' ? 'bg-green-100 text-green-700' :
          group.paymentPlanStatus === 'rejected' ? 'bg-red-100 text-red-600' :
          'bg-orange-100 text-orange-700'
        }`}>{statusLabel}</span>
      </div>

      <div className="space-y-1 mb-4">
        {group.dancers.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900">{d.name}</span>
            <span className="text-gray-500">{d.planLabel}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm border-t border-gray-100 pt-3">
        <div>
          <p className="text-gray-400 text-xs">Total dû</p>
          <p className="font-semibold text-gray-900">{(group.totalDue / 100).toFixed(2)} €</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Total encaissé</p>
          <p className={`font-semibold ${group.totalPaid >= group.totalDue ? 'text-green-700' : 'text-gray-900'}`}>
            {(group.totalPaid / 100).toFixed(2)} €
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Mode de paiement</p>
          <p className="font-medium text-gray-700">{METHOD_LABEL[group.paymentMethod] ?? group.paymentMethod}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Plan de paiement</p>
          <p className={`font-medium ${
            group.paymentPlanStatus === 'approved' ? 'text-green-700' :
            group.paymentPlanStatus === 'rejected' ? 'text-red-600' : 'text-orange-600'
          }`}>{statusLabel}</p>
        </div>
      </div>

      {group.installments.length > 0 && (
        <InstallmentsTable installments={group.installments} method={group.paymentMethod} />
      )}

      {group.paymentPlanStatus === 'pending' && group.installmentIds.length === 0 && (
        <div className="mt-4 space-y-2">
          {group.totalDue > group.totalPaid && (
            <button
              onClick={() => onPayOnline(group.totalDue - group.totalPaid)}
              disabled={payingOnline}
              className="w-full bg-green-600 text-white font-semibold py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm transition-colors"
            >
              {payingOnline ? 'Redirection…' : 'Payer en ligne ↗'}
            </button>
          )}
          <div className="flex gap-2">
            <Link href={`/membership/payment-plan?groupId=${group.id}`}
              className="flex-[3] block text-center bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 text-sm transition-colors">
              Proposer un plan de paiement →
            </Link>
            <button onClick={onCancel}
              className="flex-1 text-sm font-medium text-red-500 border border-red-200 rounded-lg py-2.5 hover:bg-red-50 transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}
      {group.paymentPlanStatus === 'rejected' && (
        <Link href={`/membership/payment-plan?groupId=${group.id}`}
          className="block w-full text-center mt-4 bg-orange-600 text-white font-semibold py-2.5 rounded-lg hover:bg-orange-700 text-sm transition-colors">
          Modifier le plan de paiement →
        </Link>
      )}
    </div>
  );
}

function InstallmentsTable({ installments, method }: { installments: InstallmentDetail[]; method: string }) {
  const isCheque = method === 'cheque';
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Échéancier</p>
      <div className="space-y-2.5">
        {installments.map((inst, i) => (
          <div key={inst.id} className="flex items-start gap-2 text-xs">
            <span className="text-gray-300 font-medium w-4 flex-shrink-0 pt-0.5">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-600">
                  {inst.expectedDate
                    ? new Date(inst.expectedDate + 'T12:00:00').toLocaleDateString('fr-FR')
                    : '—'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{(inst.amount / 100).toFixed(2)} €</span>
                  <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                    inst.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {inst.status === 'paid' ? 'Encaissé' : 'En attente'}
                  </span>
                </div>
              </div>
              {isCheque && (inst.chequeNumber || inst.draweeBank || inst.draweeCity) && (
                <p className="text-gray-400 mt-0.5">
                  {[
                    inst.chequeNumber ? `N° ${inst.chequeNumber}` : null,
                    inst.draweeBank,
                    inst.draweeCity,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
