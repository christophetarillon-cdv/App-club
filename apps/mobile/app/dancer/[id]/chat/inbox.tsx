import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import type { PrivateMessage } from '@cdv/types';

// Une page = ce nombre de MESSAGES, pas de conversations : on regroupe ensuite
// par danseur. Charger toute la collection a chaque ouverture ne passerait pas
// a l'echelle sur mobile.
const PAGE_SIZE = 150;

function timeAgo(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate?.() ?? new Date(ts.seconds * 1000);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

interface Conversation {
  dancerId: string;
  dancerName: string;
  accountId: string;
  last: PrivateMessage;
  unread: number;
}

export default function AdminInboxScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');

  const loadPage = useCallback(async (after: QueryDocumentSnapshot<DocumentData> | null) => {
    // Tri decroissant : les conversations actives remontent en premier, et la
    // pagination descend naturellement vers les plus anciennes.
    const q = after
      ? query(collection(db, 'privateMessages'), orderBy('sentAt', 'desc'), startAfter(after), limit(PAGE_SIZE))
      : query(collection(db, 'privateMessages'), orderBy('sentAt', 'desc'), limit(PAGE_SIZE));
    const snap = await getDocs(q);
    setMessages(prev => {
      const merged = new Map(prev.map(m => [m.id, m]));
      snap.docs.forEach(d => merged.set(d.id, { id: d.id, ...d.data() } as PrivateMessage));
      return [...merged.values()];
    });
    setCursor(snap.docs[snap.docs.length - 1] ?? after);
    setHasMore(snap.docs.length === PAGE_SIZE);
  }, []);

  useEffect(() => {
    loadPage(null)
      .catch(error => console.error('inbox load failed', error))
      .finally(() => setLoading(false));
  }, [loadPage]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await loadPage(cursor);
    } catch (error) {
      console.error('inbox load more failed', error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Regroupement par danseur : la collection stocke des messages, pas des
  // conversations. Le fil est identifie par fromDancerId, y compris pour les
  // reponses du club.
  const conversations = useMemo(() => {
    const byDancer = new Map<string, PrivateMessage[]>();
    for (const m of messages) {
      const key = m.fromDancerId;
      if (!key) continue;
      const list = byDancer.get(key) ?? [];
      list.push(m);
      byDancer.set(key, list);
    }
    const rows: Conversation[] = [...byDancer.entries()].map(([dancerId, msgs]) => {
      const sorted = [...msgs].sort(
        (a, b) => (a.sentAt?.seconds ?? 0) - (b.sentAt?.seconds ?? 0),
      );
      const last = sorted[sorted.length - 1]!;
      return {
        dancerId,
        dancerName: last.fromDancerName ?? 'Danseur',
        accountId: last.fromAccountId ?? '',
        last,
        unread: msgs.filter(m => !m.fromAdmin && !m.readAt).length,
      };
    });
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => !q || r.dancerName.toLowerCase().includes(q))
      .sort((a, b) => (b.last.sentAt?.seconds ?? 0) - (a.last.sentAt?.seconds ?? 0));
  }, [messages, search]);

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerRow} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.headerTitle}>
            Messages privés{totalUnread > 0 ? ` (${totalUnread})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Rechercher un danseur…"
        placeholderTextColor={Colors.textLight}
        autoCapitalize="none"
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={Colors.primary} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={c => c.dancerId}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim() ? 'Aucune conversation à ce nom.' : 'Aucune conversation.'}
            </Text>
          }
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.75}
              onPress={() => router.push({
                pathname: `/dancer/${id}/chat/admin`,
                params: {
                  targetDancerId: c.dancerId,
                  targetAccountId: c.accountId,
                  targetName: c.dancerName,
                },
              } as any)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{c.dancerName}</Text>
                <Text style={styles.preview} numberOfLines={1}>
                  {c.last.fromAdmin ? 'Vous : ' : ''}{c.last.text}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.time}>{timeAgo(c.last.sentAt)}</Text>
                {c.unread > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{c.unread}</Text></View>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            // Sans ce bouton, une conversation sans activite recente resterait
            // inaccessible : la recherche ne filtre que ce qui est charge.
            hasMore ? (
              <TouchableOpacity style={styles.more} onPress={loadMore} disabled={loadingMore} activeOpacity={0.7}>
                <Text style={styles.moreText}>
                  {loadingMore ? 'Chargement…' : 'Charger les conversations plus anciennes'}
                </Text>
              </TouchableOpacity>
            ) : conversations.length > 0 ? (
              <Text style={styles.allLoaded}>Toutes les conversations sont chargées.</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: '#2F86C0', paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600', flex: 1 },

  search: {
    margin: 14, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: Colors.text,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', marginHorizontal: 14, marginTop: 8,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  name: { fontSize: 15, lineHeight: 21, color: Colors.text, fontWeight: '600' },
  preview: { fontSize: 13, lineHeight: 19, color: Colors.textSecondary, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  time: { fontSize: 11, color: Colors.textLight },
  badge: { backgroundColor: '#E8734A', borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },

  empty: { textAlign: 'center', color: Colors.textSecondary, fontSize: 14, paddingVertical: 40 },
  more: { paddingVertical: 16, alignItems: 'center' },
  moreText: { fontSize: 14, color: '#2F86C0', fontWeight: '500' },
  allLoaded: { textAlign: 'center', color: Colors.textLight, fontSize: 12, paddingVertical: 16 },
});
