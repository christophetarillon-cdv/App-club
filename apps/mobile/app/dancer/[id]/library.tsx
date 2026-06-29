import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Linking, TextInput, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect, Line, Polyline } from 'react-native-svg';
import type { DocumentLibrary } from '@cdv/types';

// ── Catégories ──────────────────────────────────────────────────────────────

type DocCategory = 'administrative' | 'practical' | 'pedagogical' | 'events' | 'other';

const CATEGORIES: { key: DocCategory | 'all'; label: string }[] = [
  { key: 'all',            label: 'Tous' },
  { key: 'administrative', label: 'Administratif' },
  { key: 'practical',      label: 'Pratique' },
  { key: 'pedagogical',    label: 'Pédagogique' },
  { key: 'events',         label: 'Événements' },
  { key: 'other',          label: 'Autre' },
];

const CATEGORY_CONFIG: Record<DocCategory, { color: string; bg: string }> = {
  administrative: { color: '#185FA5', bg: '#E8F4FD' },
  practical:      { color: '#3B6D11', bg: '#EAF3DE' },
  pedagogical:    { color: '#534AB7', bg: '#EEEDFE' },
  events:         { color: '#E8951F', bg: '#FFF3E0' },
  other:          { color: '#6B7280', bg: '#F3F4F6' },
};

const CATEGORY_LABELS: Record<DocCategory, string> = {
  administrative: 'Administratif',
  practical:      'Pratique',
  pedagogical:    'Pédagogique',
  events:         'Événements',
  other:          'Autre',
};

// ── Utilitaires ─────────────────────────────────────────────────────────────

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function mimeColor(mime?: string) {
  if (!mime) return '#6B7280';
  if (mime.includes('pdf')) return '#DC2626';
  if (mime.includes('word') || mime.includes('document')) return '#2563EB';
  if (mime.includes('sheet') || mime.includes('excel')) return '#16A34A';
  if (mime.includes('image')) return '#7C3AED';
  return '#6B7280';
}

function MimeIcon({ mime, size = 20 }: { mime?: string; size?: number }) {
  const color = mimeColor(mime);
  if (mime?.includes('pdf')) return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="14 2 14 8 20 8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={9} y1={13} x2={15} y2={13} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={9} y1={17} x2={12} y2={17} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
  if (mime?.includes('image')) return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={2} stroke={color} strokeWidth={1.8} />
      <Path d="M3 15l5-5 4 4 3-3 6 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="14 2 14 8 20 8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Carte document ───────────────────────────────────────────────────────────

function DocCard({ item }: { item: DocumentLibrary }) {
  const catConfig = CATEGORY_CONFIG[item.category as DocCategory] ?? CATEGORY_CONFIG.other;
  const catLabel  = CATEGORY_LABELS[item.category as DocCategory] ?? 'Autre';

  const handleOpen = async () => {
    if (!item.currentFileUrl) return;
    await updateDoc(doc(db, 'documentLibrary', item.id), { downloadCount: increment(1) });
    Linking.openURL(item.currentFileUrl);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.mimeBox, { backgroundColor: mimeColor(item.currentMimeType) + '18' }]}>
          <MimeIcon mime={item.currentMimeType} size={22} />
        </View>
        <View style={styles.cardMeta}>
          <View style={[styles.badge, { backgroundColor: catConfig.bg }]}>
            <Text style={[styles.badgeText, { color: catConfig.color }]}>{catLabel}</Text>
          </View>
          <View style={styles.cardRight}>
            {item.currentVersionNumber && (
              <Text style={styles.version}>{item.currentVersionNumber}</Text>
            )}
            {!!item.currentSizeBytes && (
              <Text style={styles.size}>{formatSize(item.currentSizeBytes)}</Text>
            )}
          </View>
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      {item.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
      ) : null}

      {item.tags && item.tags.length > 0 && (
        <View style={styles.tags}>
          {item.tags.slice(0, 3).map(tag => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.downloadBtn, !item.currentFileUrl && styles.downloadBtnDisabled]}
        onPress={handleOpen}
        disabled={!item.currentFileUrl}
        activeOpacity={0.75}
      >
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
          <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M7 10l5 5 5-5M12 15V3" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={styles.downloadText}>Télécharger</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Écran principal ──────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, account, dancers } = useAuth();

  const [allDocs, setAllDocs]       = useState<DocumentLibrary[]>([]);
  const [paidSeasonIds, setPaidSeasonIds] = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [activeCategory, setActiveCategory] = useState<DocCategory | 'all'>('all');

  const isAdmin   = !!(account?.roles?.includes('admin') || dancers.some(d => d.roles.includes('admin')));
  const isMember  = dancers.some(d => d.roles.some(r => ['member', 'trial', 'instructor', 'bureau', 'admin'].includes(r)));
  const userRoles = dancers.flatMap(d => d.roles);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getDocs(query(collection(db, 'documentLibrary'), where('isActive', '==', true))),
      getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
    ]).then(([docsSnap, membershipSnap]) => {
      setAllDocs(docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentLibrary)));
      const paid = membershipSnap.docs
        .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
        .map(d => d.data().seasonId as string).filter(Boolean);
      setPaidSeasonIds([...new Set(paid)]);
    })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const visible = useMemo(() => {
    const accessible = allDocs.filter(d => {
      if (isAdmin) return true;
      if (d.accessLevel === 'public') return true;
      if (d.accessLevel === 'members' && isMember) return true;
      if (d.accessLevel === 'paid-members') {
        // Pour les docs liés à une saison, vérifie que le danseur a une adhésion valide pour cette saison
        const hasAccess = d.seasonId ? paidSeasonIds.includes(d.seasonId) : paidSeasonIds.length > 0;
        return hasAccess;
      }
      if (d.accessLevel === 'specific-roles' && d.allowedRoles?.some(r => (userRoles as string[]).includes(r))) return true;
      return false;
    });

    // Filtre catégorie
    const byCat = activeCategory === 'all'
      ? accessible
      : accessible.filter(d => d.category === activeCategory);

    // Filtre recherche
    if (!search.trim()) return byCat;
    const q = search.toLowerCase();
    return byCat.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q) ||
      d.tags?.some(t => t.toLowerCase().includes(q)),
    );
  }, [allDocs, isAdmin, isMember, userRoles, paidSeasonIds, activeCategory, search]);

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
        <TouchableOpacity style={styles.headerRow} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.headerTitle}>Bibliothèque du club</Text>
        </TouchableOpacity>

        {/* Barre de recherche */}
        <View style={styles.searchBar}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginRight: 8 }}>
            <Path d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
              stroke={Colors.textLight} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher…"
            placeholderTextColor={Colors.textLight}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filtres catégories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {CATEGORIES.map(cat => {
          const active = activeCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setActiveCategory(cat.key as DocCategory | 'all')}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Contenu */}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={d => d.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Aucun document</Text>
              <Text style={styles.emptySub}>
                {search ? 'Aucun résultat pour cette recherche.' : 'Aucun document disponible dans cette catégorie.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => <DocCard item={item} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 68, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text, padding: 0 },
  searchClear: { color: Colors.textLight, fontSize: 14, paddingLeft: 8 },

  filters: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  filterLabelActive: { color: '#fff' },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: 20, gap: 12 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mimeBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardMeta: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  cardRight: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  version: { fontSize: 11, color: Colors.textLight, fontWeight: '500' },
  size: { fontSize: 11, color: Colors.textLight },

  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, lineHeight: 20 },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: Colors.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: { fontSize: 11, color: Colors.textSecondary },

  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  downloadBtnDisabled: { opacity: 0.4 },
  downloadText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
