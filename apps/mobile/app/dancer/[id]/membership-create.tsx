import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  collection, query, where, getDocs, doc, getDoc, addDoc, writeBatch,
  serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import DateField from '@/components/DateField';
import type { PricingPlan, Season, Dancer, PaymentMethod, ProfileFieldsConfig } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS, DEFAULT_PAYMENT_INFO } from '@cdv/types';
import {
  mergeProfileFieldsConfig, computeMissingAccountFields, computeMissingDancerFields,
  type MissingField,
} from '@/lib/profileFields';

const GENDER_OPTIONS = [
  { value: 'F', label: 'Femme' },
  { value: 'M', label: 'Homme' },
  { value: 'other', label: 'Autre' },
];

// ── Constantes ───────────────────────────────────────────────────────────────

type Step = 'who' | 'incomplete-profile' | 'plan' | 'payment-info' | 'installments' | 'helloasso-pending';
type PayScope = 'me' | 'myAccount' | 'otherAccount';

const MAX_INSTALLMENTS: Record<string, number> = {
  cheque: 10, transfer: 1, cash: 1, helloasso: 1,
};
const METHOD_LABEL: Record<string, string> = {
  cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces', helloasso: 'CB / En ligne',
};

interface InstallmentForm {
  id: string;
  date: string;         // YYYY-MM-DD interne
  dateDisplay: string;  // JJ/MM/AAAA affiché
  amount: string;       // "150.00" en string
  chequeNumber: string;
  draweeBank: string;
  draweeCity: string;
}

interface BankAccount {
  id: string;
  name: string;
  bank: string;
  accountNumber: string;
  holder: string;
  label: string;
}

type CreationResult =
  | { kind: 'solo'; membershipId: string; totalDue: number; method: string }
  | { kind: 'group'; groupId: string; totalDue: number; method: string };

// ── Utilitaires ──────────────────────────────────────────────────────────────

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoToDisplay(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string | null {
  const parts = display.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return null;
  const date = new Date(+y, +m - 1, +d);
  if (isNaN(date.getTime())) return null;
  if (date.getFullYear() !== +y || date.getMonth() + 1 !== +m || date.getDate() !== +d) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function fmtCents(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

function newInstallment(iso?: string): InstallmentForm {
  const date = iso ?? todayIso();
  return { id: String(Date.now() + Math.random()), date, dateDisplay: isoToDisplay(date), amount: '', chequeNumber: '', draweeBank: '', draweeCity: '' };
}

// ── Champs du formulaire de complétion de profil ───────────────────────────

function TextField({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.textFieldInput, multiline && { height: 72, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textLight}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

function ConsentSwitch({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.consentRow}>
      <Text style={styles.consentLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.primary }} thumbColor="#fff" />
    </View>
  );
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function MembershipCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, account, dancers: myDancers } = useAuth();
  const { selectedDancer } = useDancer();

  // ── Données de base
  const [availableSeasons, setAvailableSeasons] = useState<Season[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);
  const [fieldConfig, setFieldConfig] = useState<ProfileFieldsConfig>(DEFAULT_PROFILE_FIELDS);
  const [paymentInfo, setPaymentInfo] = useState<Record<'cheque' | 'transfer' | 'cash' | 'helloasso', string>>(DEFAULT_PAYMENT_INFO);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // ── Étape courante
  const [step, setStep] = useState<Step>('who');

  // ── Step 1 : who
  const [payScope, setPayScope] = useState<PayScope>('me');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [otherSearch, setOtherSearch] = useState('');
  const [allOtherDancers, setAllOtherDancers] = useState<Dancer[]>([]);
  const [loadingOthers, setLoadingOthers] = useState(false);
  const [otherDancersLoaded, setOtherDancersLoaded] = useState(false);
  const [selectedOthers, setSelectedOthers] = useState<Dancer[]>([]);

  // ── Step 2 : plan
  const [planIds, setPlanIds] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PaymentMethod>('cheque');
  const [submitting, setSubmitting] = useState(false);

  // ── Step 3 : installments
  const [creationResult, setCreationResult] = useState<CreationResult | null>(null);
  const [installments, setInstallments] = useState<InstallmentForm[]>([newInstallment()]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittingPlan, setSubmittingPlan] = useState(false);

  // ── Chargement données d'une saison ─────────────────────────────────────

  const loadSeasonData = async (s: Season) => {
    setLoadingSeasonData(true);
    setPlans([]);
    setEnrolledIds(new Set());
    try {
      // Danseurs déjà engagés (plan approuvé OU en attente) sur cette saison,
      // tous comptes confondus — évite qu'un même danseur se retrouve avec
      // deux cotisations en double, y compris si un plan est en attente de
      // validation ou payé par quelqu'un d'autre.
      const [enrolledRes, planSnap] = await Promise.all([
        httpsCallable<{ seasonId: string }, { dancerIds: string[] }>(functions, 'getEnrolledDancerIds')({ seasonId: s.id }),
        getDocs(query(collection(db, 'pricingPlans'), where('seasonId', '==', s.id))),
      ]);
      setEnrolledIds(new Set(enrolledRes.data.dancerIds));
      setPlans(
        planSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as PricingPlan))
          .filter(p => p.isActive),
      );
    } catch (err) {
      console.error('membership-create loadSeasonData:', err);
    } finally {
      setLoadingSeasonData(false);
    }
  };

  // ── Chargement initial ───────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [seasonSnap, settingsSnap] = await Promise.all([
          getDocs(query(collection(db, 'seasons'), where('registrationOpen', '==', true))),
          getDoc(doc(db, 'appSettings', 'main')),
        ]);
        if (settingsSnap.exists()) {
          const settingsData = settingsSnap.data();
          setFieldConfig(mergeProfileFieldsConfig(settingsData.profileFields));
          setPaymentInfo({
            cheque: settingsData.paymentInfoCheque ?? DEFAULT_PAYMENT_INFO.cheque,
            transfer: settingsData.paymentInfoTransfer ?? DEFAULT_PAYMENT_INFO.transfer,
            cash: settingsData.paymentInfoCash ?? DEFAULT_PAYMENT_INFO.cash,
            helloasso: settingsData.paymentInfoHelloasso ?? DEFAULT_PAYMENT_INFO.helloasso,
          });
        }
        const bankSnap = await getDocs(collection(db, 'bankAccounts'));
        setBankAccounts(bankSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name ?? '',
          bank: d.data().bank ?? '',
          accountNumber: d.data().accountNumber ?? '',
          holder: d.data().holder ?? '',
          label: d.data().label ?? '',
        })));
        if (seasonSnap.empty) return;
        const all = seasonSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Season))
          .sort((a, b) => (b.startDate?.seconds ?? 0) - (a.startDate?.seconds ?? 0));
        setAvailableSeasons(all);
        const s = all[0]!;
        setSeason(s);
        await loadSeasonData(s);
      } catch (err) {
        console.error('membership-create loadData:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // ── Chargement danseurs autres comptes ──────────────────────────────────

  useEffect(() => {
    if (payScope !== 'otherAccount' || otherDancersLoaded) return;
    setLoadingOthers(true);
    getDocs(collection(db, 'dancers'))
      .then(snap => {
        setAllOtherDancers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Dancer)));
        setOtherDancersLoaded(true);
      })
      .finally(() => setLoadingOthers(false));
  }, [payScope]);

  // ── Calculs dérivés ──────────────────────────────────────────────────────

  const myDancersAvailable = myDancers.filter(d => !enrolledIds.has(d.id));

  const allSelected: Dancer[] = useMemo(() => {
    if (payScope === 'me') return myDancers.slice(0, 1);
    const mySelected = myDancers.filter(d => selectedIds.has(d.id));
    const otherSelected = selectedOthers;
    return [...mySelected, ...otherSelected].filter(d => !enrolledIds.has(d.id));
  }, [payScope, myDancers, selectedIds, selectedOthers, enrolledIds]);

  const otherResults = useMemo(() => {
    if (!otherSearch.trim() || otherSearch.length < 2) return [];
    const myIds = new Set(myDancers.map(d => d.id));
    const selectedOtherIds = new Set(selectedOthers.map(d => d.id));
    const q = otherSearch.toLowerCase();
    return allOtherDancers
      .filter(d =>
        !myIds.has(d.id) &&
        !selectedOtherIds.has(d.id) &&
        !enrolledIds.has(d.id) &&
        `${d.firstName} ${d.lastName}`.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [otherSearch, allOtherDancers, myDancers, selectedOthers, enrolledIds]);

  const canGoToPlan = allSelected.length > 0;
  const canCreate = allSelected.length > 0 && allSelected.every(d => !!planIds[d.id]);

  const totalDue = allSelected.reduce((sum, d) => {
    const p = plans.find(pl => pl.id === planIds[d.id]);
    return sum + (p?.amount ?? 0);
  }, 0);

  const totalInstallmentsCents = installments.reduce((sum, i) => {
    const v = parseFloat(i.amount);
    return sum + (isNaN(v) ? 0 : Math.round(v * 100));
  }, 0);
  const remaining = (creationResult?.totalDue ?? 0) - totalInstallmentsCents;

  // ── Vérification fiche d'identité complète ────────────────────────────────
  // Danseurs de mon propre compte (+ n'importe quel danseur si je suis
  // admin/bureau) : je peux éditer leur fiche, donc on demande de compléter
  // directement dans le déroulé. Danseurs d'un autre compte sans droits :
  // on laisse la cotisation se créer, mais on marque leur fiche pour que
  // leur titulaire soit obligé de compléter à sa prochaine connexion.
  const isAdmin = selectedDancer?.roles.includes('admin') ?? false;

  const editableDancers = useMemo(
    () => allSelected.filter(d => d.accountId === user?.uid || isAdmin),
    [allSelected, user, isAdmin],
  );
  const nonEditableDancers = useMemo(
    () => allSelected.filter(d => d.accountId !== user?.uid && !isAdmin),
    [allSelected, user, isAdmin],
  );

  const accountMissing = useMemo(
    () => (editableDancers.some(d => d.accountId === user?.uid) ? computeMissingAccountFields(account, fieldConfig) : []),
    [editableDancers, account, fieldConfig, user],
  );
  const dancersMissing = useMemo(
    () => editableDancers
      .map(d => ({ dancer: d, fields: computeMissingDancerFields(d, fieldConfig) }))
      .filter(x => x.fields.length > 0),
    [editableDancers, fieldConfig],
  );
  const nonEditableMissing = useMemo(
    () => nonEditableDancers
      .map(d => ({ dancer: d, fields: computeMissingDancerFields(d, fieldConfig) }))
      .filter(x => x.fields.length > 0),
    [nonEditableDancers, fieldConfig],
  );

  const hasIncompleteEditableProfile = accountMissing.length > 0 || dancersMissing.length > 0;

  // ── Formulaire de complétion (Option A : une seule page consolidée) ──────
  const [profileForm, setProfileForm] = useState<Record<string, string | boolean>>({});
  const setFormValue = (key: string, value: string | boolean) =>
    setProfileForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (step !== 'incomplete-profile') return;
    // Pré-remplit avec les valeurs déjà existantes (non vides) pour ne pas
    // perdre la saisie si l'utilisateur navigue entre les étapes.
    setProfileForm(prev => {
      const next = { ...prev };
      if (accountMissing.length > 0 && account) {
        if (next['account.phone'] === undefined) next['account.phone'] = account.phone ?? '';
        if (next['account.marketingConsent'] === undefined) next['account.marketingConsent'] = account.marketingConsent ?? false;
        if (next['account.imageRightsConsent'] === undefined) next['account.imageRightsConsent'] = account.imageRightsConsent ?? false;
      }
      for (const { dancer } of dancersMissing) {
        const p = dancer.id;
        if (next[`${p}.street`] === undefined) next[`${p}.street`] = dancer.street ?? '';
        if (next[`${p}.postalCode`] === undefined) next[`${p}.postalCode`] = dancer.postalCode ?? '';
        if (next[`${p}.city`] === undefined) next[`${p}.city`] = dancer.city ?? '';
        if (next[`${p}.profession`] === undefined) next[`${p}.profession`] = dancer.profession ?? '';
        if (next[`${p}.medicalNotes`] === undefined) next[`${p}.medicalNotes`] = dancer.medicalNotes ?? '';
        if (next[`${p}.gender`] === undefined) next[`${p}.gender`] = dancer.gender ?? '';
        if (next[`${p}.birthDate`] === undefined) {
          next[`${p}.birthDate`] = dancer.birthDate
            ? isoToDisplay(new Date(dancer.birthDate.seconds * 1000).toISOString().slice(0, 10))
            : '';
        }
        if (next[`${p}.healthCertificate`] === undefined) next[`${p}.healthCertificate`] = dancer.healthCertificate ?? false;
        if (next[`${p}.emergencyName`] === undefined) next[`${p}.emergencyName`] = dancer.emergencyContact?.name ?? '';
        if (next[`${p}.emergencyPhone`] === undefined) next[`${p}.emergencyPhone`] = dancer.emergencyContact?.phone ?? '';
      }
      return next;
    });
  }, [step]);

  const isFieldMissingValue = (key: string, fieldKey: string): boolean => {
    const v = profileForm[key];
    if (fieldKey === 'healthCertificate' || fieldKey === 'marketingConsent' || fieldKey === 'imageRightsConsent') {
      return v !== true;
    }
    if (fieldKey === 'emergencyContact') {
      return !(profileForm[key + 'Name'] as string)?.trim() || !(profileForm[key + 'Phone'] as string)?.trim();
    }
    return !(typeof v === 'string' && v.trim());
  };

  const profileFormValid = (): boolean => {
    if (accountMissing.some(f => isFieldMissingValue(`account.${f.key}`, f.key))) return false;
    for (const { dancer, fields } of dancersMissing) {
      for (const f of fields) {
        if (f.key === 'emergencyContact') {
          if (!(profileForm[`${dancer.id}.emergencyName`] as string)?.trim() || !(profileForm[`${dancer.id}.emergencyPhone`] as string)?.trim()) return false;
        } else if (isFieldMissingValue(`${dancer.id}.${f.key}`, f.key)) {
          return false;
        }
      }
    }
    return true;
  };

  const [savingProfile, setSavingProfile] = useState(false);

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
            const iso = displayToIso(profileForm[`${p}.birthDate`] as string);
            if (iso) {
              const [y, m, d] = iso.split('-').map(Number);
              dancerUpdates.birthDate = new Date(y!, m! - 1, d!);
            }
          }
        }
        writes.push(updateDoc(doc(db, 'dancers', p), dancerUpdates));
        // Le flag n'a de sens que si posé précédemment (ancien scan/tiers) —
        // on le lève une fois la fiche complétée par le titulaire lui-même.
        if (dancer.profileCompletionRequired) {
          writes.push(updateDoc(doc(db, 'dancers', p), { profileCompletionRequired: false }));
        }
      }

      await Promise.all(writes);

      if (plans.length === 1) {
        const pre: Record<string, string> = {};
        allSelected.forEach(d => { pre[d.id] = plans[0]!.id; });
        setPlanIds(pre);
      }
      setStep('plan');
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer les informations.");
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Step 1 → 2 ──────────────────────────────────────────────────────────

  const handleWhoNext = () => {
    if (!canGoToPlan) return;
    if (hasIncompleteEditableProfile) {
      setStep('incomplete-profile');
      return;
    }
    // Pré-sélection plan si 1 seul plan dispo
    if (plans.length === 1) {
      const pre: Record<string, string> = {};
      allSelected.forEach(d => { pre[d.id] = plans[0]!.id; });
      setPlanIds(pre);
    }
    setStep('plan');
  };

  // ── Création membership ──────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!user || !season || !canCreate) return;
    setSubmitting(true);
    try {
      let result: CreationResult;

      if (allSelected.length === 1) {
        // Cotisation solo
        const dancer = allSelected[0]!;
        const plan = plans.find(p => p.id === planIds[dancer.id])!;
        const ref = await addDoc(collection(db, 'memberships'), {
          userId: user.uid,
          dancerId: dancer.id,
          seasonId: season.id,
          pricingPlanId: plan.id,
          totalDue: plan.amount,
          totalPaid: 0,
          paymentMethod: method,
          paymentPlanStatus: 'pending',
          installmentIds: [],
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        result = { kind: 'solo', membershipId: ref.id, totalDue: plan.amount, method };
      } else {
        // Cotisations groupées
        const batch = writeBatch(db);
        const groupRef = doc(collection(db, 'paymentGroups'));
        const membershipIds: string[] = [];
        let groupTotal = 0;

        for (const dancer of allSelected) {
          const plan = plans.find(p => p.id === planIds[dancer.id])!;
          const mRef = doc(collection(db, 'memberships'));
          batch.set(mRef, {
            userId: user.uid,
            dancerId: dancer.id,
            seasonId: season.id,
            pricingPlanId: plan.id,
            totalDue: plan.amount,
            totalPaid: 0,
            paymentMethod: method,
            paymentPlanStatus: 'pending',
            installmentIds: [],
            status: 'pending',
            paymentGroupId: groupRef.id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          membershipIds.push(mRef.id);
          groupTotal += plan.amount;
        }

        batch.set(groupRef, {
          userId: user.uid,
          membershipIds,
          totalDue: groupTotal,
          totalPaid: 0,
          paymentMethod: method,
          paymentPlanStatus: 'pending',
          installmentIds: [],
          seasonId: season.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await batch.commit();
        result = { kind: 'group', groupId: groupRef.id, totalDue: groupTotal, method };
      }

      // Danseurs d'un autre compte dont la fiche est incomplète et que je
      // n'ai pas le droit d'éditer : leur titulaire devra compléter à sa
      // prochaine connexion (best-effort, ne bloque pas la cotisation).
      if (nonEditableMissing.length > 0) {
        const flagFn = httpsCallable(functions, 'flagProfileCompletion');
        Promise.all(nonEditableMissing.map(x => flagFn({ dancerId: x.dancer.id }))).catch(() => {});
      }

      if (method === 'helloasso') {
        await handleHelloAsso(result);
      } else {
        setCreationResult(result);
        setInstallments([newInstallment()]);
        setStep('installments');
      }
    } catch (e) {
      Alert.alert('Erreur', 'Une erreur est survenue lors de la création.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── HelloAsso ────────────────────────────────────────────────────────────

  const handleHelloAsso = async (result: CreationResult) => {
    try {
      const createCheckout = httpsCallable(functions, 'createHelloAssoCheckout');
      const payload = result.kind === 'solo'
        ? { membershipId: result.membershipId, amount: result.totalDue }
        : { groupId: result.groupId, amount: result.totalDue };
      const res = await createCheckout(payload);
      const { redirectUrl } = res.data as { redirectUrl: string };
      setCreationResult(result);
      setStep('helloasso-pending');
      await Linking.openURL(redirectUrl);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir le paiement en ligne.');
    }
  };

  // ── Soumission échéancier ────────────────────────────────────────────────

  const handleSubmitPlan = async () => {
    if (!user || !creationResult) return;
    setSubmitError(null);

    const maxInst = MAX_INSTALLMENTS[creationResult.method] ?? 1;
    if (installments.length > maxInst) {
      setSubmitError(`Maximum ${maxInst} versement(s) pour ce mode de paiement.`);
      return;
    }

    // Validation
    for (const inst of installments) {
      if (!inst.date || !inst.amount || parseFloat(inst.amount) <= 0) {
        setSubmitError('Tous les versements doivent avoir une date et un montant valide.');
        return;
      }
    }
    if (Math.abs(remaining) > 0) {
      setSubmitError(`Le total (${fmtCents(totalInstallmentsCents)}) doit être égal au montant dû (${fmtCents(creationResult.totalDue)}).`);
      return;
    }

    setSubmittingPlan(true);
    try {
      const batch = writeBatch(db);
      const ids: string[] = [];

      for (const inst of installments) {
        const ref = doc(collection(db, 'paymentInstallments'));
        const chequeData = creationResult.method === 'cheque' ? {
          ...(inst.chequeNumber ? { chequeNumber: inst.chequeNumber } : {}),
          ...(inst.draweeBank   ? { draweeBank: inst.draweeBank }     : {}),
          ...(inst.draweeCity   ? { draweeCity: inst.draweeCity }     : {}),
        } : {};
        batch.set(ref, {
          ...(creationResult.kind === 'solo'
            ? { membershipId: creationResult.membershipId }
            : { paymentGroupId: creationResult.groupId }),
          userId: user.uid,
          amount: Math.round(parseFloat(inst.amount) * 100),
          method: creationResult.method,
          expectedDate: inst.date,
          status: 'pending',
          ...chequeData,
        });
        ids.push(ref.id);
      }

      if (creationResult.kind === 'solo') {
        batch.update(doc(db, 'memberships', creationResult.membershipId), {
          installmentIds: ids,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(doc(db, 'paymentGroups', creationResult.groupId), {
          installmentIds: ids,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      Alert.alert(
        'Cotisation envoyée',
        'Votre plan de paiement est en attente de validation par l\'association.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch {
      setSubmitError('Erreur lors de l\'enregistrement. Veuillez réessayer.');
    } finally {
      setSubmittingPlan(false);
    }
  };

  // ── Gestion retour ───────────────────────────────────────────────────────

  const handleBack = () => {
    if (step === 'who') router.back();
    else if (step === 'incomplete-profile') setStep('who');
    else if (step === 'plan') setStep(hasIncompleteEditableProfile ? 'incomplete-profile' : 'who');
    else if (step === 'payment-info') setStep('plan');
    else if (step === 'installments') setStep('payment-info');
    else router.back();
  };

  const handleSeasonChange = (s: Season) => {
    if (!user || s.id === season?.id) return;
    setSeason(s);
    // Réinitialise le formulaire pour la nouvelle saison
    setStep('who');
    setSelectedIds(new Set());
    setSelectedOthers([]);
    setPlanIds({});
    setInstallments([newInstallment()]);
    setCreationResult(null);
    loadSeasonData(s);
  };

  const STEP_LABELS: Record<Step, string> = {
    'who': 'Bénéficiaires',
    'incomplete-profile': 'Compléter le profil',
    'plan': 'Forfait & paiement',
    'payment-info': 'Informations',
    'installments': 'Échéancier',
    'helloasso-pending': 'Paiement en ligne',
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!season) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <Text style={styles.emptyTitle}>Aucune saison disponible</Text>
        <Text style={styles.emptySub}>Vérifiez que le champ «&nbsp;registrationOpen&nbsp;» est bien à&nbsp;true dans la collection&nbsp;seasons.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (plans.length === 0) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <Text style={styles.emptyTitle}>Aucun forfait disponible</Text>
        <Text style={styles.emptySub}>
          Saison trouvée : «&nbsp;{season.label}&nbsp;» (id&nbsp;: {season.id}){'\n\n'}
          Aucun forfait actif n'est associé à cette saison dans la collection&nbsp;pricingPlans. Vérifiez que les docs ont bien le champ&nbsp;seasonId égal à cet identifiant et isActive&nbsp;:&nbsp;true.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <LinearGradient
          colors={['#2F86C0', '#2F86C0', '#7FBFE3', '#D8EAF3', Colors.background]}
          locations={[0, 0.32, 0.58, 0.8, 0.97]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerWave} pointerEvents="none">
          <Svg width="100%" height="100%" viewBox="0 0 400 44" preserveAspectRatio="none">
            <Path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" fill={Colors.background} />
          </Svg>
        </View>
        <TouchableOpacity style={styles.headerRow} onPress={handleBack} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.headerTitle}>{STEP_LABELS[step]}</Text>
        </TouchableOpacity>
        {availableSeasons.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.seasonScroll}
            contentContainerStyle={styles.seasonScrollContent}
          >
            {availableSeasons.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.seasonChip, season?.id === s.id && styles.seasonChipActive]}
                onPress={() => handleSeasonChange(s)}
                activeOpacity={0.75}
              >
                <Text style={[styles.seasonLabel, season?.id === s.id && styles.seasonLabelActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.seasonChip, styles.seasonChipActive]}>
            <Text style={[styles.seasonLabel, styles.seasonLabelActive]}>Saison {season.label}</Text>
          </View>
        )}
      </View>

      {/* Étapes */}
      {loadingSeasonData ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <>
          {step === 'who'               && renderWho()}
          {step === 'incomplete-profile' && renderIncompleteProfile()}
          {step === 'plan'              && renderPlan()}
          {step === 'payment-info'      && renderPaymentInfo()}
          {step === 'installments'      && renderInstallments()}
          {step === 'helloasso-pending' && renderHelloAssoPending()}
        </>
      )}
    </KeyboardAvoidingView>
  );

  // ── STEP INTERMÉDIAIRE : PROFIL INCOMPLET (Option A, page consolidée) ────

  function renderIncompleteProfile() {
    const valid = profileFormValid();
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.incompleteIntro}>
          Merci de compléter les informations manquantes avant de choisir une cotisation.
        </Text>

        {nonEditableMissing.length > 0 && (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              ⚠️ {nonEditableMissing.map(x => `${x.dancer.firstName} ${x.dancer.lastName}`).join(', ')}
              {nonEditableMissing.length > 1 ? ' ont' : ' a'} une fiche incomplète, mais vous n'avez pas les
              droits pour la modifier. La cotisation sera quand même créée ; leur titulaire de compte devra
              compléter sa fiche à sa prochaine connexion.
            </Text>
          </View>
        )}

        {accountMissing.length > 0 && (
          <View style={styles.incompleteCard}>
            <Text style={styles.incompleteSectionTitle}>Mes informations de compte</Text>
            {accountMissing.some(f => f.key === 'phone') && (
              <TextField
                label="Téléphone"
                value={profileForm['account.phone'] as string ?? ''}
                onChangeText={v => setFormValue('account.phone', v)}
                keyboardType="phone-pad"
              />
            )}
            {accountMissing.some(f => f.key === 'marketingConsent') && (
              <ConsentSwitch
                label="J'accepte de recevoir des communications marketing du club."
                value={!!profileForm['account.marketingConsent']}
                onChange={v => setFormValue('account.marketingConsent', v)}
              />
            )}
            {accountMissing.some(f => f.key === 'imageRightsConsent') && (
              <ConsentSwitch
                label="J'autorise le club à utiliser mon image (photos/vidéos)."
                value={!!profileForm['account.imageRightsConsent']}
                onChange={v => setFormValue('account.imageRightsConsent', v)}
              />
            )}
          </View>
        )}

        {dancersMissing.map(({ dancer, fields }) => (
          <View key={dancer.id} style={styles.incompleteCard}>
            <Text style={styles.incompleteSectionTitle}>{dancer.firstName} {dancer.lastName}</Text>
            {fields.some(f => f.key === 'birthDate') && (
              <DateField label="Date de naissance" value={profileForm[`${dancer.id}.birthDate`] as string ?? ''}
                onChangeText={v => setFormValue(`${dancer.id}.birthDate`, v)} maximumDate={new Date()} />
            )}
            {fields.some(f => f.key === 'gender') && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Genre</Text>
                <View style={styles.chipsRow}>
                  {GENDER_OPTIONS.map(opt => {
                    const active = profileForm[`${dancer.id}.gender`] === opt.value;
                    return (
                      <TouchableOpacity key={opt.value} style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setFormValue(`${dancer.id}.gender`, opt.value)} activeOpacity={0.75}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
            {fields.some(f => f.key === 'street') && (
              <TextField label="Rue" value={profileForm[`${dancer.id}.street`] as string ?? ''}
                onChangeText={v => setFormValue(`${dancer.id}.street`, v)} />
            )}
            {fields.some(f => f.key === 'postalCode') && (
              <TextField label="Code postal" value={profileForm[`${dancer.id}.postalCode`] as string ?? ''}
                onChangeText={v => setFormValue(`${dancer.id}.postalCode`, v)} keyboardType="number-pad" />
            )}
            {fields.some(f => f.key === 'city') && (
              <TextField label="Ville" value={profileForm[`${dancer.id}.city`] as string ?? ''}
                onChangeText={v => setFormValue(`${dancer.id}.city`, v)} />
            )}
            {fields.some(f => f.key === 'profession') && (
              <TextField label="Profession" value={profileForm[`${dancer.id}.profession`] as string ?? ''}
                onChangeText={v => setFormValue(`${dancer.id}.profession`, v)} />
            )}
            {fields.some(f => f.key === 'emergencyContact') && (
              <>
                <TextField label="Contact d'urgence — nom" value={profileForm[`${dancer.id}.emergencyName`] as string ?? ''}
                  onChangeText={v => setFormValue(`${dancer.id}.emergencyName`, v)} />
                <TextField label="Contact d'urgence — téléphone" value={profileForm[`${dancer.id}.emergencyPhone`] as string ?? ''}
                  onChangeText={v => setFormValue(`${dancer.id}.emergencyPhone`, v)} keyboardType="phone-pad" />
              </>
            )}
            {fields.some(f => f.key === 'medicalNotes') && (
              <TextField label="Notes médicales" value={profileForm[`${dancer.id}.medicalNotes`] as string ?? ''}
                onChangeText={v => setFormValue(`${dancer.id}.medicalNotes`, v)} multiline />
            )}
            {fields.some(f => f.key === 'healthCertificate') && (
              <ConsentSwitch
                label="Certificat médical fourni"
                value={!!profileForm[`${dancer.id}.healthCertificate`]}
                onChange={v => setFormValue(`${dancer.id}.healthCertificate`, v)}
              />
            )}
          </View>
        ))}

        <TouchableOpacity
          style={[styles.primaryBtn, (!valid || savingProfile) && styles.btnDisabled]}
          onPress={handleSaveProfileForm}
          disabled={!valid || savingProfile}
          activeOpacity={0.85}
        >
          {savingProfile
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>Continuer →</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── STEP 1 : WHO ─────────────────────────────────────────────────────────

  function renderWho() {
    const toggleMy = (id: string) => {
      setSelectedIds(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
    };
    const addOther = (d: Dancer) => {
      setSelectedOthers(prev => [...prev, d]);
      setOtherSearch('');
    };
    const removeOther = (id: string) => setSelectedOthers(prev => prev.filter(d => d.id !== id));

    return (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* Scope */}
        <Text style={styles.sectionTitle}>Pour qui ?</Text>
        {(['me', 'myAccount', 'otherAccount'] as PayScope[]).map(scope => {
          const labels: Record<PayScope, string> = {
            me: 'Pour moi seul(e)',
            myAccount: 'Plusieurs danseurs de mon compte',
            otherAccount: 'Moi + danseurs d\'un autre compte',
          };
          return (
            <TouchableOpacity key={scope} style={[styles.scopeBtn, payScope === scope && styles.scopeBtnActive]}
              onPress={() => { setPayScope(scope); setSelectedIds(new Set()); setSelectedOthers([]); }} activeOpacity={0.7}>
              <View style={[styles.scopeDot, payScope === scope && styles.scopeDotActive]} />
              <Text style={[styles.scopeLabel, payScope === scope && styles.scopeLabelActive]}>{labels[scope]}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Mes danseurs */}
        {(payScope === 'myAccount' || payScope === 'otherAccount') && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Mes danseurs</Text>
            {myDancersAvailable.map(d => {
              const checked = selectedIds.has(d.id);
              return (
                <TouchableOpacity key={d.id} style={[styles.dancerRow, checked && styles.dancerRowActive]}
                  onPress={() => toggleMy(d.id)} activeOpacity={0.75}>
                  <View style={[styles.checkbox, checked && styles.checkboxActive]}>
                    {checked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.dancerName}>{d.firstName} {d.lastName}</Text>
                </TouchableOpacity>
              );
            })}
            {myDancersAvailable.length === 0 && (
              <Text style={styles.emptySmall}>Tous vos danseurs sont déjà inscrits.</Text>
            )}
          </>
        )}

        {/* Danseurs autres comptes */}
        {payScope === 'otherAccount' && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Danseurs d'un autre compte</Text>
            <View style={styles.searchBar}>
              <TextInput style={styles.searchInput} value={otherSearch} onChangeText={setOtherSearch}
                placeholder="Rechercher par nom…" placeholderTextColor={Colors.textLight} />
            </View>
            {loadingOthers && <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />}
            {otherResults.map(d => (
              <TouchableOpacity key={d.id} style={styles.dancerRow} onPress={() => addOther(d)} activeOpacity={0.75}>
                <View style={styles.addIcon}>
                  <Text style={styles.addIconText}>+</Text>
                </View>
                <Text style={styles.dancerName}>{d.firstName} {d.lastName}</Text>
              </TouchableOpacity>
            ))}
            {selectedOthers.map(d => (
              <View key={d.id} style={[styles.dancerRow, styles.dancerRowActive]}>
                <View style={[styles.checkbox, styles.checkboxActive]}>
                  <Text style={styles.checkmark}>✓</Text>
                </View>
                <Text style={styles.dancerName}>{d.firstName} {d.lastName}</Text>
                <TouchableOpacity onPress={() => removeOther(d.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Résumé sélection */}
        {allSelected.length > 0 && (
          <View style={styles.selectionSummary}>
            <Text style={styles.selectionText}>{allSelected.length} danseur{allSelected.length > 1 ? 's' : ''} sélectionné{allSelected.length > 1 ? 's' : ''}</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.primaryBtn, !canGoToPlan && styles.btnDisabled]}
          onPress={handleWhoNext} disabled={!canGoToPlan} activeOpacity={0.8}>
          <Text style={styles.primaryBtnText}>Continuer →</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── STEP INTERMÉDIAIRE : INFORMATIONS DE PAIEMENT ────────────────────────

  function renderPaymentInfo() {
    const text = paymentInfo[method];
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.incompleteCard}>
          <Text style={styles.incompleteSectionTitle}>{METHOD_LABEL[method]}</Text>
          <Text style={styles.paymentInfoText}>{text}</Text>
        </View>

        {method === 'transfer' && bankAccounts.length > 0 && (
          <View style={styles.incompleteCard}>
            <Text style={styles.incompleteSectionTitle}>Coordonnées bancaires du club</Text>
            {bankAccounts.map(acc => (
              <View key={acc.id} style={{ marginBottom: 10 }}>
                {acc.label ? <Text style={styles.bankLabel}>{acc.label}</Text> : null}
                <Text style={styles.bankLine}>Titulaire : {acc.holder}</Text>
                <Text style={styles.bankLine}>Banque : {acc.bank}</Text>
                <Text style={styles.bankLine}>IBAN : {acc.accountNumber}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={[styles.primaryBtn, submitting && styles.btnDisabled]}
          onPress={handleCreate} disabled={submitting} activeOpacity={0.8}>
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>
                {method === 'helloasso' ? 'Payer en ligne →' : 'Créer et définir l\'échéancier →'}
              </Text>
          }
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── STEP 2 : PLAN ────────────────────────────────────────────────────────

  function renderPlan() {
    return (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* Plan par danseur */}
        {allSelected.map(dancer => (
          <View key={dancer.id} style={styles.planCard}>
            <Text style={styles.planDancer}>{dancer.firstName} {dancer.lastName}</Text>
            {plans.map(plan => {
              const selected = planIds[dancer.id] === plan.id;
              return (
                <TouchableOpacity key={plan.id} style={[styles.planOption, selected && styles.planOptionActive]}
                  onPress={() => setPlanIds(prev => ({ ...prev, [dancer.id]: plan.id }))} activeOpacity={0.75}>
                  <View style={[styles.radio, selected && styles.radioActive]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planLabel, selected && styles.planLabelActive]}>{plan.label}</Text>
                    {plan.conditions ? <Text style={styles.planConditions}>{plan.conditions}</Text> : null}
                  </View>
                  <Text style={[styles.planAmount, selected && styles.planAmountActive]}>{fmtCents(plan.amount)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* Mode de paiement */}
        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Mode de paiement</Text>
        <View style={styles.methodRow}>
          {(['cheque', 'transfer', 'cash', 'helloasso'] as PaymentMethod[]).map(m => (
            <TouchableOpacity key={m} style={[styles.methodBtn, method === m && styles.methodBtnActive]}
              onPress={() => setMethod(m)} activeOpacity={0.75}>
              <Text style={[styles.methodLabel, method === m && styles.methodLabelActive]}>{METHOD_LABEL[m]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {method === 'helloasso' && (
          <Text style={styles.helloassoHint}>Vous serez redirigé vers HelloAsso pour finaliser le paiement.</Text>
        )}

        {/* Total */}
        {canCreate && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>{fmtCents(totalDue)}</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.primaryBtn, !canCreate && styles.btnDisabled]}
          onPress={() => setStep('payment-info')} disabled={!canCreate} activeOpacity={0.8}>
          <Text style={styles.primaryBtnText}>Continuer →</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── STEP 3 : INSTALLMENTS ────────────────────────────────────────────────

  function renderInstallments() {
    if (!creationResult) return null;
    const maxInst = MAX_INSTALLMENTS[creationResult.method] ?? 1;
    const isBalanced = remaining === 0;

    const updateInst = (id: string, field: keyof InstallmentForm, value: string) => {
      setInstallments(prev => prev.map(i => {
        if (i.id !== id) return i;
        if (field === 'dateDisplay') {
          const iso = displayToIso(value);
          return { ...i, dateDisplay: value, date: iso ?? i.date };
        }
        return { ...i, [field]: value };
      }));
    };

    const addInst = () => {
      if (installments.length >= maxInst) return;
      setInstallments(prev => [...prev, newInstallment()]);
    };

    const removeInst = (id: string) => {
      if (installments.length <= 1) return;
      setInstallments(prev => prev.filter(i => i.id !== id));
    };

    return (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.instHeader}>
          <Text style={styles.sectionTitle}>Versements ({installments.length}/{maxInst} max)</Text>
          <View style={[styles.balanceBadge, { backgroundColor: isBalanced ? '#D1FAE5' : '#FEF3C7' }]}>
            <Text style={[styles.balanceBadgeText, { color: isBalanced ? '#065F46' : '#92400E' }]}>
              {isBalanced ? 'Équilibré' : `Reste : ${fmtCents(Math.abs(remaining))}`}
            </Text>
          </View>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Montant dû</Text>
          <Text style={styles.totalAmount}>{fmtCents(creationResult.totalDue)}</Text>
        </View>

        {installments.map((inst, idx) => (
          <View key={inst.id} style={styles.instCard}>
            <View style={styles.instCardHeader}>
              <Text style={styles.instCardTitle}>Versement {idx + 1}</Text>
              {installments.length > 1 && (
                <TouchableOpacity onPress={() => removeInst(inst.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.removeBtn}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.instFields}>
              <View style={styles.instField}>
                <DateField label="Date" value={inst.dateDisplay} onChangeText={v => updateInst(inst.id, 'dateDisplay', v)} />
              </View>
              <View style={styles.instField}>
                <Text style={styles.fieldLabel}>Montant (€)</Text>
                <TextInput style={styles.fieldInput} value={inst.amount} onChangeText={v => updateInst(inst.id, 'amount', v)}
                  placeholder="0.00" placeholderTextColor={Colors.textLight} keyboardType="decimal-pad" />
              </View>
            </View>
            {creationResult.method === 'cheque' && (
              <View style={styles.instFields}>
                <View style={styles.instField}>
                  <Text style={styles.fieldLabel}>N° chèque</Text>
                  <TextInput style={styles.fieldInput} value={inst.chequeNumber} onChangeText={v => updateInst(inst.id, 'chequeNumber', v)}
                    placeholder="Optionnel" placeholderTextColor={Colors.textLight} />
                </View>
                <View style={styles.instField}>
                  <Text style={styles.fieldLabel}>Banque</Text>
                  <TextInput style={styles.fieldInput} value={inst.draweeBank} onChangeText={v => updateInst(inst.id, 'draweeBank', v)}
                    placeholder="Optionnel" placeholderTextColor={Colors.textLight} />
                </View>
                <View style={[styles.instField, { flexBasis: '100%' }]}>
                  <Text style={styles.fieldLabel}>Ville</Text>
                  <TextInput style={styles.fieldInput} value={inst.draweeCity} onChangeText={v => updateInst(inst.id, 'draweeCity', v)}
                    placeholder="Optionnel" placeholderTextColor={Colors.textLight} />
                </View>
              </View>
            )}
          </View>
        ))}

        {installments.length < maxInst && (
          <TouchableOpacity style={styles.addInstBtn} onPress={addInst} activeOpacity={0.75}>
            <Text style={styles.addInstBtnText}>+ Ajouter un versement</Text>
          </TouchableOpacity>
        )}

        {submitError && <Text style={styles.errorText}>{submitError}</Text>}

        <TouchableOpacity
          style={[styles.primaryBtn, (!isBalanced || submittingPlan) && styles.btnDisabled]}
          onPress={handleSubmitPlan}
          disabled={!isBalanced || submittingPlan}
          activeOpacity={0.8}
        >
          {submittingPlan
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>Envoyer pour validation</Text>
          }
        </TouchableOpacity>
        <Text style={styles.hintText}>Votre plan sera soumis à l'association pour approbation.</Text>
      </ScrollView>
    );
  }

  // ── HelloAsso en attente ─────────────────────────────────────────────────

  function renderHelloAssoPending() {
    return (
      <View style={[styles.content, { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 }]}>
        <Svg width={56} height={56} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={10} stroke={Colors.primary} strokeWidth={1.5} />
          <Path d="M12 6v6l4 2" stroke={Colors.primary} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
        <Text style={[styles.emptyTitle, { marginTop: 16 }]}>Paiement ouvert</Text>
        <Text style={[styles.emptySub, { textAlign: 'center', marginTop: 8 }]}>
          La page HelloAsso a été ouverte dans votre navigateur.{'\n'}
          Revenez ici une fois le paiement effectué.
        </Text>
        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 32, width: '100%' }]} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.primaryBtnText}>Retour à mes cotisations</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 56, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  seasonScroll: { marginTop: 2 },
  seasonScrollContent: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingRight: 4 },
  seasonChip: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: 'transparent' },
  seasonChipActive: { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'rgba(255,255,255,0.95)' },
  seasonLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  seasonLabelActive: { color: Colors.primary },

  content: { paddingHorizontal: 20, paddingTop: 16 },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  // Scope
  scopeBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: Colors.white, borderRadius: 14, marginBottom: 8, borderWidth: 1.5, borderColor: Colors.border },
  scopeBtnActive: { borderColor: Colors.primary, backgroundColor: '#EEF4FF' },
  scopeDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border },
  scopeDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  scopeLabel: { fontSize: 14, color: Colors.text, flex: 1 },
  scopeLabelActive: { color: Colors.primary, fontWeight: '600' },

  // Danseurs
  dancerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: Colors.white, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  dancerRowActive: { borderColor: Colors.primary, backgroundColor: '#EEF4FF' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dancerName: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.text },
  addIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  addIconText: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: -1 },
  removeBtn: { color: Colors.textLight, fontSize: 16, paddingHorizontal: 4 },
  emptySmall: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic', marginBottom: 8 },
  selectionSummary: { backgroundColor: '#EEF4FF', borderRadius: 10, padding: 10, marginVertical: 12, alignItems: 'center' },
  selectionText: { fontSize: 14, fontWeight: '600', color: Colors.primary },

  // Search
  searchBar: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { fontSize: 14, color: Colors.text },

  // Plan
  planCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 14, marginBottom: 14, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  planDancer: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  planOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border },
  planOptionActive: { borderColor: Colors.primary, backgroundColor: '#EEF4FF' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  planLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  planLabelActive: { color: Colors.primary },
  planConditions: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  planAmount: { fontSize: 15, fontWeight: '700', color: Colors.text },
  planAmountActive: { color: Colors.primary },

  // Méthode
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  methodBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  methodBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  methodLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  methodLabelActive: { color: '#fff' },
  helloassoHint: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12, fontStyle: 'italic' },

  // Total
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  totalLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  totalAmount: { fontSize: 18, fontWeight: '800', color: Colors.text },

  // Installments
  instHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  balanceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  balanceBadgeText: { fontSize: 12, fontWeight: '600' },
  instCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 10, gap: 10, borderWidth: 0.5, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  instCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  instCardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  instFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  instField: { flexBasis: '47%', flexGrow: 1 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInput: { backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: Colors.text },
  addInstBtn: { borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 16 },
  addInstBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  hintText: { fontSize: 12, color: Colors.textLight, textAlign: 'center', marginTop: 10 },
  errorText: { fontSize: 13, color: Colors.danger, textAlign: 'center', marginBottom: 12 },

  // Boutons
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { backgroundColor: Colors.white, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  secondaryBtnText: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  backBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 24 },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // États vides
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  // Profil incomplet
  incompleteIntro: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 14 },
  incompleteCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.06)' },
  incompleteTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  incompleteSub: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 14 },
  incompleteSectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  paymentInfoText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  bankLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  bankLine: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  missingList: { gap: 8 },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  missingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  missingLabel: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  noticeCard: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 14, padding: 14, marginBottom: 12 },
  noticeText: { fontSize: 13, color: '#9A3412', lineHeight: 19 },
  textFieldInput: { backgroundColor: Colors.background, borderWidth: 0.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.text },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 0.5, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  consentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  consentLabel: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },
});
