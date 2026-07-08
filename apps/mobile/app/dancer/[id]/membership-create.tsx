import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  collection, query, where, getDocs, doc, getDoc, addDoc, writeBatch,
  serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import type { PricingPlan, Season, Dancer, PaymentMethod, ProfileFieldsConfig } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS } from '@cdv/types';

// ── Constantes ───────────────────────────────────────────────────────────────

type Step = 'who' | 'incomplete-profile' | 'plan' | 'installments' | 'helloasso-pending';
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

// ── Composant principal ──────────────────────────────────────────────────────

export default function MembershipCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, account, dancers: myDancers } = useAuth();

  // ── Données de base
  const [availableSeasons, setAvailableSeasons] = useState<Season[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);
  const [fieldConfig, setFieldConfig] = useState<ProfileFieldsConfig>(DEFAULT_PROFILE_FIELDS);

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

  const loadSeasonData = async (s: Season, uid: string) => {
    setLoadingSeasonData(true);
    setPlans([]);
    setEnrolledIds(new Set());
    try {
      const [enrolledSnap, planSnap] = await Promise.all([
        getDocs(query(collection(db, 'memberships'), where('userId', '==', uid))),
        getDocs(query(collection(db, 'pricingPlans'), where('seasonId', '==', s.id))),
      ]);
      setEnrolledIds(new Set(
        enrolledSnap.docs
          .filter(d => d.data().seasonId === s.id && d.data().paymentPlanStatus === 'approved')
          .map(d => d.data().dancerId)
          .filter(Boolean),
      ));
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
          const saved = settingsSnap.data().profileFields as Partial<ProfileFieldsConfig> | undefined;
          const merged = { ...DEFAULT_PROFILE_FIELDS };
          if (saved) {
            for (const key of Object.keys(DEFAULT_PROFILE_FIELDS) as (keyof ProfileFieldsConfig)[]) {
              if (saved[key]) merged[key] = { ...DEFAULT_PROFILE_FIELDS[key], ...saved[key] };
            }
          }
          setFieldConfig(merged);
        }
        if (seasonSnap.empty) return;
        const all = seasonSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Season))
          .sort((a, b) => (b.startDate?.seconds ?? 0) - (a.startDate?.seconds ?? 0));
        setAvailableSeasons(all);
        const s = all[0]!;
        setSeason(s);
        await loadSeasonData(s, user.uid);
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
  // Limité au cas "je paie pour moi" : les autres cas (compte famille,
  // autre compte) nécessiteraient de basculer le danseur actif pour éditer
  // sa fiche, ce qui aurait des effets de bord plus larges dans l'app.
  const missingProfileFields = useMemo(() => {
    if (payScope !== 'me' || !account) return [];
    const dancer = allSelected[0];
    if (!dancer) return [];
    const missing: string[] = [];
    if (fieldConfig.phone.required && !account.phone?.trim()) missing.push('Téléphone');
    if (fieldConfig.birthDate.required && !dancer.birthDate) missing.push('Date de naissance');
    if (fieldConfig.gender.required && !dancer.gender) missing.push('Genre');
    if (fieldConfig.street.required && !dancer.street?.trim()) missing.push('Rue');
    if (fieldConfig.postalCode.required && !dancer.postalCode?.trim()) missing.push('Code postal');
    if (fieldConfig.city.required && !dancer.city?.trim()) missing.push('Ville');
    if (fieldConfig.profession.required && !dancer.profession?.trim()) missing.push('Profession');
    if (fieldConfig.emergencyContact.required && !(dancer.emergencyContact?.name?.trim() && dancer.emergencyContact?.phone?.trim())) {
      missing.push("Contact d'urgence");
    }
    if (fieldConfig.medicalNotes.required && !dancer.medicalNotes?.trim()) missing.push('Notes médicales');
    if (fieldConfig.healthCertificate.required && !dancer.healthCertificate) missing.push('Certificat médical');
    if (fieldConfig.marketingConsent.required && !account.marketingConsent) missing.push('Consentement marketing');
    if (fieldConfig.imageRightsConsent.required && !account.imageRightsConsent) missing.push("Droit à l'image");
    return missing;
  }, [payScope, account, allSelected, fieldConfig]);

  // ── Step 1 → 2 ──────────────────────────────────────────────────────────

  const handleWhoNext = () => {
    if (!canGoToPlan) return;
    if (missingProfileFields.length > 0) {
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
    else if (step === 'plan') setStep(missingProfileFields.length > 0 ? 'incomplete-profile' : 'who');
    else if (step === 'installments') setStep('plan');
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
    loadSeasonData(s, user.uid);
  };

  const STEP_LABELS: Record<Step, string> = {
    'who': 'Bénéficiaires',
    'incomplete-profile': 'Compléter le profil',
    'plan': 'Forfait & paiement',
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
          {step === 'installments'      && renderInstallments()}
          {step === 'helloasso-pending' && renderHelloAssoPending()}
        </>
      )}
    </KeyboardAvoidingView>
  );

  // ── STEP INTERMÉDIAIRE : PROFIL INCOMPLET ───────────────────────────────

  function renderIncompleteProfile() {
    const dancer = allSelected[0];
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.incompleteCard}>
          <Text style={styles.incompleteTitle}>Fiche d'identité incomplète</Text>
          <Text style={styles.incompleteSub}>
            {dancer ? `${dancer.firstName} ${dancer.lastName}` : 'Ce danseur'} doit compléter les
            informations suivantes avant de choisir une cotisation :
          </Text>
          <View style={styles.missingList}>
            {missingProfileFields.map(label => (
              <View key={label} style={styles.missingRow}>
                <View style={styles.missingDot} />
                <Text style={styles.missingLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push(`/dancer/${dancer!.id}/infos` as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Compléter mon profil</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => {
            if (missingProfileFields.length > 0) {
              Alert.alert('Profil encore incomplet', 'Il reste des informations à renseigner.');
              return;
            }
            if (plans.length === 1) {
              const pre: Record<string, string> = {};
              allSelected.forEach(d => { pre[d.id] = plans[0]!.id; });
              setPlanIds(pre);
            }
            setStep('plan');
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>
            {missingProfileFields.length === 0 ? 'Continuer →' : "J'ai complété mon profil"}
          </Text>
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

        <TouchableOpacity style={[styles.primaryBtn, (!canCreate || submitting) && styles.btnDisabled]}
          onPress={handleCreate} disabled={!canCreate || submitting} activeOpacity={0.8}>
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
                <Text style={styles.fieldLabel}>Date (JJ/MM/AAAA)</Text>
                <TextInput style={styles.fieldInput} value={inst.dateDisplay} onChangeText={v => updateInst(inst.id, 'dateDisplay', v)}
                  placeholder="JJ/MM/AAAA" placeholderTextColor={Colors.textLight} keyboardType="numeric" />
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
  incompleteCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 18, marginBottom: 8, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.06)' },
  incompleteTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  incompleteSub: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 14 },
  missingList: { gap: 8 },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  missingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  missingLabel: { fontSize: 14, color: Colors.text, fontWeight: '500' },
});
