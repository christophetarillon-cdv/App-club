import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  collection, query, where, getDocs, doc, getDoc, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import type {
  Membership, PaymentInstallment, PricingPlan, Season, Dancer,
  PaymentMethod, PaymentPlanStatus, MembershipStatus, InstallmentStatus,
} from '@cdv/types';

// ── Types étendus (champs extra Firestore non inclus dans @cdv/types) ────────

type MembershipX = Membership & { dancerId?: string; paymentGroupId?: string };

type InstallmentX = PaymentInstallment & {
  chequeNumber?: string;
  draweeBank?: string;
  draweeCity?: string;
};

interface PaymentGroup {
  id: string;
  userId: string;
  seasonId: string;
  membershipIds: string[];
  installmentIds: string[];
  totalDue: number;
  totalPaid: number;
  paymentMethod: PaymentMethod;
  paymentPlanStatus: PaymentPlanStatus;
  refundAmount?: number;
  refundMethod?: PaymentMethod;
  refundReference?: string;
}

// ── Entrées d'affichage ──────────────────────────────────────────────────────

interface SoloEntry {
  kind: 'solo';
  membership: MembershipX;
  dancer: Dancer | null;
  plan: PricingPlan | null;
  installments: InstallmentX[];
}

interface GroupEntry {
  kind: 'group';
  group: PaymentGroup;
  rows: { membership: MembershipX; dancer: Dancer | null; plan: PricingPlan | null }[];
  installments: InstallmentX[];
}

type Entry = SoloEntry | GroupEntry;

// ── Config statuts ───────────────────────────────────────────────────────────

const MEMBERSHIP_STATUS: Record<MembershipStatus, { label: string; color: string; bg: string }> = {
  pending:  { label: 'En attente',  color: '#92400E', bg: '#FEF3C7' },
  active:   { label: 'Active',      color: '#065F46', bg: '#D1FAE5' },
  complete: { label: 'Soldée',      color: '#1E40AF', bg: '#DBEAFE' },
};

const PLAN_STATUS: Record<PaymentPlanStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Plan en attente', color: '#92400E', bg: '#FEF3C7' },
  approved:  { label: 'Plan approuvé',   color: '#065F46', bg: '#D1FAE5' },
  rejected:  { label: 'Plan refusé',     color: '#991B1B', bg: '#FEE2E2' },
  cancelled: { label: 'Annulé',          color: '#6B7280', bg: '#F3F4F6' },
};

const INSTALLMENT_STATUS: Record<InstallmentStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'En attente', color: '#92400E', bg: '#FEF3C7' },
  paid:      { label: 'Encaissé',   color: '#065F46', bg: '#D1FAE5' },
  late:      { label: 'En retard',  color: '#991B1B', bg: '#FEE2E2' },
  cancelled: { label: 'Annulé',     color: '#6B7280', bg: '#F3F4F6' },
};

const METHOD_LABEL: Record<string, string> = {
  cheque:    'Chèque',
  transfer:  'Virement',
  cash:      'Espèces',
  helloasso: 'CB / En ligne',
};

// ── Utilitaires ──────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── Composants ───────────────────────────────────────────────────────────────

function StatusBadge({ cfg }: { cfg: { label: string; color: string; bg: string } }) {
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function AmountRow({ totalDue, totalPaid }: { totalDue: number; totalPaid: number }) {
  const remaining = totalDue - totalPaid;
  const progress = totalDue > 0 ? Math.min(totalPaid / totalDue, 1) : 0;
  return (
    <View style={styles.amountBlock}>
      <View style={styles.amountRow}>
        <View style={styles.amountCell}>
          <Text style={styles.amountLabel}>Total dû</Text>
          <Text style={styles.amountValue}>{fmt(totalDue)}</Text>
        </View>
        <View style={styles.amountCell}>
          <Text style={styles.amountLabel}>Encaissé</Text>
          <Text style={[styles.amountValue, { color: '#065F46' }]}>{fmt(totalPaid)}</Text>
        </View>
        <View style={styles.amountCell}>
          <Text style={styles.amountLabel}>Reste dû</Text>
          <Text style={[styles.amountValue, { color: remaining > 0 ? '#92400E' : '#065F46' }]}>
            {fmt(remaining)}
          </Text>
        </View>
      </View>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
      </View>
    </View>
  );
}

function InstallmentsList({ installments }: { installments: InstallmentX[] }) {
  if (installments.length === 0) return null;
  return (
    <View style={styles.installments}>
      <Text style={styles.installmentsTitle}>Échéancier</Text>
      {installments.map((inst, i) => {
        const s = INSTALLMENT_STATUS[inst.status] ?? INSTALLMENT_STATUS.pending;
        return (
          <View key={inst.id} style={styles.instRow}>
            <View style={styles.instLeft}>
              <Text style={styles.instNum}>{i + 1}</Text>
            </View>
            <View style={styles.instBody}>
              <View style={styles.instTopRow}>
                <Text style={styles.instDate}>{fmtDate(inst.expectedDate)}</Text>
                <Text style={styles.instAmount}>{fmt(inst.amount)}</Text>
                <View style={[styles.instBadge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.instBadgeText, { color: s.color }]}>{s.label}</Text>
                </View>
              </View>
              {inst.chequeNumber && (
                <Text style={styles.instCheque}>
                  N°{inst.chequeNumber}
                  {inst.draweeBank ? ` · ${inst.draweeBank}` : ''}
                  {inst.draweeCity ? ` · ${inst.draweeCity}` : ''}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RefundInfo({ amount, method, reference }: { amount?: number; method?: string; reference?: string }) {
  if (!amount) return null;
  return (
    <View style={styles.refundRow}>
      <Text style={styles.refundLabel}>Remboursé</Text>
      <Text style={styles.refundValue}>
        {fmt(amount)}
        {method ? ` · ${METHOD_LABEL[method] ?? method}` : ''}
        {reference ? ` · ${reference}` : ''}
      </Text>
    </View>
  );
}

function SoloCard({ entry }: { entry: SoloEntry }) {
  const { membership: m, dancer, plan, installments } = entry;
  const pStatus = PLAN_STATUS[m.paymentPlanStatus] ?? PLAN_STATUS.pending;
  const mStatus = m.paymentPlanStatus === 'cancelled' ? pStatus : (MEMBERSHIP_STATUS[m.status] ?? MEMBERSHIP_STATUS.pending);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardDancer}>
          {dancer ? `${dancer.firstName} ${dancer.lastName}` : 'Danseur'}
        </Text>
        <StatusBadge cfg={mStatus} />
      </View>

      <View style={styles.cardMeta}>
        {plan && <Text style={styles.cardPlan}>{plan.label}</Text>}
        <Text style={styles.cardMethod}>{METHOD_LABEL[m.paymentMethod] ?? m.paymentMethod}</Text>
      </View>

      <AmountRow totalDue={m.totalDue} totalPaid={m.totalPaid} />
      <RefundInfo amount={m.refundAmount} method={m.refundMethod} reference={m.refundReference} />

      <StatusBadge cfg={pStatus} />

      <InstallmentsList installments={installments} />
    </View>
  );
}

function GroupCard({ entry }: { entry: GroupEntry }) {
  const { group: g, rows, installments } = entry;
  const pStatus = PLAN_STATUS[g.paymentPlanStatus] ?? PLAN_STATUS.pending;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.groupTag}>
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
            <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#534AB7" strokeWidth={2} strokeLinecap="round" />
            <Circle cx={9} cy={7} r={4} stroke="#534AB7" strokeWidth={2} />
            <Path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#534AB7" strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <Text style={styles.groupTagText}>Cotisations groupées</Text>
        </View>
        <Text style={styles.cardMethod}>{METHOD_LABEL[g.paymentMethod] ?? g.paymentMethod}</Text>
      </View>

      {rows.map(({ membership: m, dancer, plan }) => (
        <View key={m.id} style={styles.groupRow}>
          <View style={[styles.groupDot, { backgroundColor: '#534AB7' }]} />
          <Text style={styles.groupDancer}>
            {dancer ? `${dancer.firstName} ${dancer.lastName}` : 'Danseur'}
          </Text>
          {plan && <Text style={styles.groupPlan}>{plan.label}</Text>}
        </View>
      ))}

      <AmountRow totalDue={g.totalDue} totalPaid={g.totalPaid} />
      <RefundInfo amount={g.refundAmount} method={g.refundMethod} reference={g.refundReference} />
      <StatusBadge cfg={pStatus} />
      <InstallmentsList installments={installments} />
    </View>
  );
}

// ── Écran principal ──────────────────────────────────────────────────────────

export default function MembershipScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user, dancers } = useAuth();

  const [availableSeasons, setAvailableSeasons] = useState<Season[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const loadForSeason = useCallback(async (s: Season) => {
    if (!user) return;
    setLoadingEntries(true);
    setEntries([]);
    try {
      const [membershipSnap, groupSnap, planSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'memberships'),
          where('userId', '==', user.uid),
          where('seasonId', '==', s.id),
        )),
        getDocs(query(
          collection(db, 'paymentGroups'),
          where('userId', '==', user.uid),
          where('seasonId', '==', s.id),
        )),
        getDocs(query(collection(db, 'pricingPlans'), where('seasonId', '==', s.id))),
      ]);

      const memberships = membershipSnap.docs.map(d => ({ id: d.id, ...d.data() } as MembershipX));
      const groups      = groupSnap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentGroup));
      const plans       = planSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as PricingPlan))
        .filter(p => p.isActive);

      const planById   = Object.fromEntries(plans.map(p => [p.id, p]));
      const dancerById = Object.fromEntries(dancers.map(d => [d.id, d as Dancer]));

      const missingIds = [
        ...new Set(memberships.map(m => m.dancerId).filter((did): did is string => !!did && !(did in dancerById))),
      ];
      if (missingIds.length > 0) {
        const extras = await Promise.all(missingIds.map(did => getDoc(doc(db, 'dancers', did))));
        extras.forEach(snap => {
          if (snap.exists()) dancerById[snap.id] = { id: snap.id, ...snap.data() } as Dancer;
        });
      }

      const soloMemberships  = memberships.filter(m => !m.paymentGroupId);
      const groupedMemberIds = new Set(groups.flatMap(g => g.membershipIds));
      const allInstIds = [
        ...new Set([
          ...soloMemberships.flatMap(m => m.installmentIds ?? []),
          ...groups.flatMap(g => g.installmentIds ?? []),
        ]),
      ];

      const installments: Record<string, InstallmentX> = {};
      if (allInstIds.length > 0) {
        const snaps = await Promise.all(allInstIds.map(iid => getDoc(doc(db, 'paymentInstallments', iid))));
        snaps.forEach(snap => {
          if (snap.exists()) installments[snap.id] = { id: snap.id, ...snap.data() } as InstallmentX;
        });
      }

      const result: Entry[] = [];
      for (const m of soloMemberships) {
        if (groupedMemberIds.has(m.id)) continue;
        result.push({
          kind: 'solo',
          membership: m,
          dancer: m.dancerId ? (dancerById[m.dancerId] ?? null) : null,
          plan: planById[m.pricingPlanId] ?? null,
          installments: (m.installmentIds ?? []).map(iid => installments[iid]).filter(Boolean) as InstallmentX[],
        });
      }
      for (const g of groups) {
        const gMemberships = memberships.filter(m => g.membershipIds.includes(m.id));
        result.push({
          kind: 'group',
          group: g,
          rows: gMemberships.map(m => ({
            membership: m,
            dancer: m.dancerId ? (dancerById[m.dancerId] ?? null) : null,
            plan: planById[m.pricingPlanId] ?? null,
          })),
          installments: (g.installmentIds ?? []).map(iid => installments[iid]).filter(Boolean) as InstallmentX[],
        });
      }
      setEntries(result);
    } catch (err) {
      console.error('membership loadForSeason:', err);
    } finally {
      setLoadingEntries(false);
    }
  }, [user, dancers]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'seasons'), orderBy('startDate', 'desc')),
        );
        if (snap.empty) return;
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Season));
        setAvailableSeasons(all);
        // Priorité : saison active, sinon inscriptions ouvertes, sinon la plus récente
        const best = all.find(s => s.isActive) ?? all.find(s => s.registrationOpen) ?? all[0]!;
        setSeason(best);
        await loadForSeason(best);
      } catch (err) {
        console.error('membership load:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const handleSeasonChange = (s: Season) => {
    if (s.id === season?.id) return;
    setSeason(s);
    loadForSeason(s);
  };

  return (
    <View style={styles.root}>
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
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.headerRow} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.headerTitle}>Ma cotisation</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push(`/dancer/${id}/membership-create` as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>+ Créer</Text>
          </TouchableOpacity>
        </View>
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
        ) : season ? (
          <View style={[styles.seasonChip, styles.seasonChipActive]}>
            <Text style={[styles.seasonLabel, styles.seasonLabelActive]}>Saison {season.label}</Text>
          </View>
        ) : null}
      </View>

      {loading || loadingEntries ? (
        <View style={styles.loader}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {entries.length === 0 ? (
            <View style={styles.empty}>
              <Svg width={52} height={52} viewBox="0 0 24 24" fill="none">
                <Path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"
                  stroke={Colors.border} strokeWidth={1.5} />
                <Path d="M12 8v4M12 16h.01" stroke={Colors.border} strokeWidth={1.8} strokeLinecap="round" />
              </Svg>
              <Text style={styles.emptyTitle}>Aucune cotisation</Text>
              <Text style={styles.emptySub}>
                Aucune cotisation trouvée pour la saison en cours.
              </Text>
            </View>
          ) : (
            entries.map((entry, i) =>
              entry.kind === 'solo'
                ? <SoloCard key={entry.membership.id} entry={entry} />
                : <GroupCard key={entry.group.id} entry={entry} />,
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 56, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBtn: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  seasonScroll: { marginTop: 2 },
  seasonScrollContent: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingRight: 4 },
  seasonChip: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  seasonChipActive: { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'rgba(255,255,255,0.95)' },
  seasonLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  seasonLabelActive: { color: Colors.primary },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },

  // Carte
  card: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  cardDancer: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPlan: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  cardMethod: { fontSize: 13, color: Colors.textLight },

  // Groupe
  groupTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTagText: { fontSize: 14, fontWeight: '700', color: '#534AB7' },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupDancer: { fontSize: 14, fontWeight: '600', color: Colors.text, flex: 1 },
  groupPlan: { fontSize: 13, color: Colors.textSecondary },

  // Badge
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },

  // Montants
  amountBlock: { gap: 8 },
  amountRow: { flexDirection: 'row', gap: 8 },
  amountCell: { flex: 1, backgroundColor: Colors.background, borderRadius: 10, padding: 10, alignItems: 'center' },
  amountLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 3 },
  amountValue: { fontSize: 14, fontWeight: '700', color: Colors.text },
  progressBg: { height: 4, backgroundColor: Colors.border, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: '#22C55E', borderRadius: 2 },

  // Remboursement
  refundRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  refundLabel: { fontSize: 12, color: Colors.textSecondary },
  refundValue: { fontSize: 12, fontWeight: '700', color: '#991B1B' },

  // Échéancier
  installments: { gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  installmentsTitle: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  instRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  instLeft: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  instNum: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  instBody: { flex: 1, gap: 2 },
  instTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  instDate: { fontSize: 13, color: Colors.text, flex: 1 },
  instAmount: { fontSize: 13, fontWeight: '700', color: Colors.text },
  instBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  instBadgeText: { fontSize: 11, fontWeight: '600' },
  instCheque: { fontSize: 11, color: Colors.textLight },

  // Vide
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },
});
