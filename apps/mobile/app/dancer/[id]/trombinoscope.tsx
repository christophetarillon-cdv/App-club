import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, Image, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import type { Dancer } from '@cdv/types';

// ── Types locaux ─────────────────────────────────────────────────────────────


// ── Constantes ───────────────────────────────────────────────────────────────

const NUM_COLS = 3;
const H_PAD = 20;
const GAP = 12;

const AVATAR_BG   = ['#BFDBFE', '#DDD6FE', '#BBF7D0', '#FED7AA', '#FBCFE8', '#99F6E4'];
const AVATAR_TEXT = ['#1E40AF', '#5B21B6', '#065F46', '#92400E', '#9D174D', '#0F766E'];

function avatarIdx(d: Dancer) {
  return (d.firstName.charCodeAt(0) ?? 0) % AVATAR_BG.length;
}

// ── Écran principal ──────────────────────────────────────────────────────────

export default function TrombinoscopeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const itemWidth = (width - H_PAD * 2 - GAP * (NUM_COLS - 1)) / NUM_COLS;

  const { selectedDancer } = useDancer();
  const isAdmin = selectedDancer?.roles?.includes('admin') ?? false;

  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [dancerSnap, seasonSnap] = await Promise.all([
          getDocs(collection(db, 'dancers')),
          getDocs(query(collection(db, 'seasons'), orderBy('startDate', 'desc'))),
        ]);

        const allDancers = dancerSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Dancer))
          .filter(d => d.isActive !== false);

        if (!seasonSnap.empty) {
          const allSeasons = seasonSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; label: string; isActive?: boolean; registrationOpen?: boolean }));
          const season =
            allSeasons.find(s => s.isActive) ??
            allSeasons.find(s => s.registrationOpen) ??
            allSeasons[0]!;

          // Règle d'accès : le danseur courant doit avoir un plan approuvé pour cette saison
          const currentDancer = allDancers.find(d => d.id === selectedDancer?.id);
          const hasAccess = isAdmin || (currentDancer?.validatedSeasonIds?.includes(season.id) ?? false);
          if (!hasAccess) {
            setAccessDenied(true);
            return;
          }

          setDancers(
            allDancers
              .filter(d => d.validatedSeasonIds?.includes(season.id))
              .sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr')),
          );
        } else {
          setDancers(allDancers.sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr')));
        }
      } catch (err) {
        console.error('trombinoscope load:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    if (!search.trim()) return dancers;
    const q = search.toLowerCase();
    return dancers.filter(d => `${d.firstName} ${d.lastName}`.toLowerCase().includes(q));
  }, [dancers, search]);

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
            <Text style={styles.headerTitle}>Trombinoscope</Text>
          </TouchableOpacity>
          {!loading && !accessDenied && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{filtered.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
                stroke="rgba(255,255,255,0.7)" strokeWidth={2} strokeLinecap="round" />
            </Svg>
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher…"
              placeholderTextColor="rgba(255,255,255,0.55)"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>


      </View>

      {/* Contenu */}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : accessDenied ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Accès réservé</Text>
          <Text style={styles.emptySub}>Votre cotisation doit être validée{'\n'}pour accéder au trombinoscope.</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Aucun danseur trouvé</Text>
          <Text style={styles.emptySub}>Essayez de modifier vos filtres.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={d => d.id}
          numColumns={NUM_COLS}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item: d }) => {
            const idx = avatarIdx(d);
            const size = itemWidth - 8;
            return (
              <View style={[styles.cell, { width: itemWidth }]}>
                {d.photoUrl ? (
                  <Image
                    source={{ uri: d.photoUrl }}
                    style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarInitials, { width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_BG[idx] }]}>
                    <Text style={[styles.initials, { color: AVATAR_TEXT[idx], fontSize: size * 0.36 }]}>
                      {d.firstName[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                <Text style={styles.cellName} numberOfLines={2}>{d.firstName}</Text>
              </View>
            );
          }}
        />
      )}

    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: H_PAD, paddingBottom: 56, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  countBadge: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  countText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  searchRow: { marginBottom: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, padding: 0 },
  searchClear: { color: 'rgba(255,255,255,0.7)', fontSize: 14, paddingHorizontal: 4 },

  grid: { paddingHorizontal: H_PAD, paddingTop: 20 },
  gridRow: { gap: GAP, marginBottom: GAP },
  cell: { alignItems: 'center', gap: 6 },
  avatar: { overflow: 'hidden' },
  avatarInitials: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '700' },
  cellName: { fontSize: 12, fontWeight: '600', color: Colors.text, textAlign: 'center', lineHeight: 16 },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary },

});
