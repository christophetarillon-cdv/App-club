import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Linking, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import type { PersonalDocument } from '@cdv/types';

interface Season { id: string; label: string; startDateSeconds: number; isActive: boolean; }

const TYPE_CONFIG = {
  receipt:     { label: 'Reçu de paiement', color: '#3B6D11', bg: '#EAF3DE' },
  attestation: { label: 'Attestation',       color: '#185FA5', bg: '#E8F4FD' },
  invoice:     { label: 'Facture',           color: '#534AB7', bg: '#EEEDFE' },
} as const;

function formatAmount(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

function formatDate(ts: { seconds: number }) {
  return new Date(ts.seconds * 1000).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Svg width={56} height={56} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={2} width={14} height={18} rx={2} stroke={Colors.border} strokeWidth={1.5} />
        <Path d="M7 7h6M7 10h4" stroke={Colors.border} strokeWidth={1.5} strokeLinecap="round" />
        <Circle cx={17} cy={17} r={5} fill={Colors.background} stroke={Colors.border} strokeWidth={1.5} />
        <Path d="M17 15v4M15 17h4" stroke={Colors.border} strokeWidth={1.5} strokeLinecap="round" />
      </Svg>
      <Text style={styles.emptyTitle}>Aucun document disponible</Text>
      <Text style={styles.emptySub}>
        Les reçus de paiement et attestations apparaîtront ici automatiquement.
      </Text>
    </View>
  );
}

function DocCard({ doc }: { doc: PersonalDocument }) {
  const config = TYPE_CONFIG[doc.type] ?? TYPE_CONFIG.receipt;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.badge, { backgroundColor: config.bg }]}>
          <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
        </View>
        {doc.receiptNumber && (
          <Text style={styles.receiptNum}>#{doc.receiptNumber}</Text>
        )}
      </View>

      <View style={styles.cardBody}>
        {doc.memberName && (
          <Text style={styles.memberName}>{doc.memberName}</Text>
        )}
        <View style={styles.metaRow}>
          {doc.seasonLabel && (
            <Text style={styles.meta}>{doc.seasonLabel}</Text>
          )}
          {doc.amount !== undefined && (
            <Text style={styles.amount}>{formatAmount(doc.amount)}</Text>
          )}
        </View>
        <Text style={styles.date}>{formatDate(doc.generatedAt)}</Text>
      </View>

      <TouchableOpacity
        style={styles.downloadBtn}
        onPress={() => Linking.openURL(doc.fileUrl)}
        activeOpacity={0.75}
      >
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M7 10l5 5 5-5M12 15V3" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={styles.downloadText}>Ouvrir le PDF</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MyDocumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [allDocs, setAllDocs]             = useState<PersonalDocument[]>([]);
  const [validatedSeasons, setValidatedSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getDocs(query(collection(db, 'documents'), where('userId', '==', user.uid), orderBy('generatedAt', 'desc'))),
      getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
      getDocs(collection(db, 'seasons')),
    ]).then(([docsSnap, membershipSnap, seasonSnap]) => {
      setAllDocs(docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PersonalDocument)));

      const paidIds = new Set(
        membershipSnap.docs
          .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
          .map(d => d.data().seasonId as string).filter(Boolean),
      );

      const validated: Season[] = seasonSnap.docs
        .filter(d => paidIds.has(d.id))
        .map(d => ({
          id: d.id,
          label: d.data().label ?? d.id,
          startDateSeconds: d.data().startDate?.seconds ?? 0,
          isActive: d.data().isActive === true,
        }))
        .sort((a, b) => b.startDateSeconds - a.startDateSeconds); // plus récente en premier

      setValidatedSeasons(validated);

      const defaultSeason = validated.find(s => s.isActive) ?? validated[0];
      if (defaultSeason) setSelectedSeasonId(defaultSeason.id);
    })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const selectedSeason = validatedSeasons.find(s => s.id === selectedSeasonId);

  // Sélecteur visible uniquement si le danseur a au moins une saison précédente validée
  const showSeasonSelector = validatedSeasons.length > 1;

  const visibleDocs = useMemo(() => {
    if (!showSeasonSelector || !selectedSeason) return allDocs;
    return allDocs.filter(d => {
      if (!d.seasonLabel) return true; // documents sans saison → toujours visibles
      return d.seasonLabel === selectedSeason.label;
    });
  }, [allDocs, showSeasonSelector, selectedSeason]);

  return (
    <View style={styles.root}>
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
        <TouchableOpacity style={styles.headerRow} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.headerTitle}>Mes documents</Text>
        </TouchableOpacity>
      </View>

      {showSeasonSelector && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.seasonRow}
        >
          {validatedSeasons.map(s => {
            const active = s.id === selectedSeasonId;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.seasonChip, active && styles.seasonChipActive]}
                onPress={() => setSelectedSeasonId(s.id)}
                activeOpacity={0.75}
              >
                {s.isActive && (
                  <View style={[styles.seasonDot, active && styles.seasonDotActive]} />
                )}
                <Text style={[styles.seasonChipText, active && styles.seasonChipTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={visibleDocs}
          keyExtractor={d => d.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          ListEmptyComponent={<EmptyState />}
          renderItem={({ item }) => <DocCard doc={item} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 56, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },

  seasonRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  seasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  seasonChipActive: {
    backgroundColor: '#185FA5',
    borderColor: '#185FA5',
  },
  seasonChipText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  seasonChipTextActive: { color: '#fff', fontWeight: '600' },
  seasonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  seasonDotActive: { backgroundColor: 'rgba(255,255,255,0.8)' },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    gap: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  receiptNum: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },

  cardBody: { gap: 4 },
  memberName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { fontSize: 13, color: Colors.textSecondary },
  amount: { fontSize: 15, fontWeight: '700', color: Colors.text },
  date: { fontSize: 12, color: Colors.textLight, marginTop: 2 },

  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  downloadText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
