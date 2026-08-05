import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  collection, getDocs, getDoc, query, where, orderBy, limit, doc, updateDoc, onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import BottomTabBar from '@/components/BottomTabBar';
import type { ChatChannel, ChatMessage } from '@cdv/types';

interface ChannelRow {
  channel: ChatChannel;
  lastText: string;
  unread: boolean;
}

function notifKey(channelId: string) { return `chat_${channelId}`; }

function previewOf(m?: ChatMessage): string {
  if (!m) return 'Aucun message';
  if (m.text) return `${m.authorName.split(' ')[0]} : ${m.text}`;
  if (m.mediaType === 'image') return `${m.authorName.split(' ')[0]} : 📷 Photo`;
  if (m.mediaType === 'video') return `${m.authorName.split(' ')[0]} : 🎬 Vidéo`;
  if (m.mediaType === 'audio') return `${m.authorName.split(' ')[0]} : 🎵 Audio`;
  if (m.fileName) return `${m.authorName.split(' ')[0]} : 📎 ${m.fileName}`;
  return `${m.authorName.split(' ')[0]} : Nouveau message`;
}

export default function ChatListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, account } = useAuth();
  const { selectedDancer } = useDancer();

  // Cumul compte + fiche danseur : le role peut etre porte par l'un ou
  // l'autre. Mêmes roles que la permission /admin/private-messages.
  const isStaff = [...(account?.roles ?? []), ...(selectedDancer?.roles ?? [])]
    .some(r => r === 'admin' || r === 'bureau');

  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminUnread, setAdminUnread] = useState(false);

  // En direct (pas juste au focus) pour que la pastille se mette a jour des
  // que le danseur a lu la reponse, meme s'il revient tres vite de l'ecran
  // de conversation. Scope par danseur : chacun a sa propre conversation.
  useEffect(() => {
    if (!selectedDancer) return;
    const q = query(
      collection(db, 'privateMessages'),
      where('fromDancerId', '==', selectedDancer.id),
      where('fromAdmin', '==', true),
    );
    const unsub = onSnapshot(q, snap => {
      setAdminUnread(snap.docs.some(d => !d.data().readByDancerAt));
    });
    return unsub;
  }, [selectedDancer?.id]);

  const load = useCallback(async () => {
    if (!selectedDancer || !user) return;
    const [chSnap, membershipSnap, seasonSnap] = await Promise.all([
      getDocs(query(collection(db, 'chatChannels'), where('isActive', '==', true), orderBy('createdAt', 'asc'))),
      getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
      getDocs(collection(db, 'seasons')),
    ]);

    const isAdminOrInstructor = selectedDancer.roles.includes('admin') || selectedDancer.roles.includes('instructor');
    const paidIds = new Set(
      membershipSnap.docs
        .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
        .map(d => d.data().seasonId as string).filter(Boolean),
    );
    const currentSeasonId = seasonSnap.docs.find(d => d.data().isActive === true)?.id ?? null;
    const hasCurrentSeason = currentSeasonId ? paidIds.has(currentSeasonId) : false;

    const channels = chSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as ChatChannel))
      .filter(ch => {
        if (isAdminOrInstructor) return true;
        if (ch.newMembersAccess === false) return false;
        return hasCurrentSeason;
      });

    const dancerSnap = await getDoc(doc(db, 'dancers', selectedDancer.id));
    const lastRead: Record<string, number> = (dancerSnap.data()?.chatLastRead as Record<string, number>) ?? {};

    const built = await Promise.all(channels.map(async ch => {
      const msgSnap = await getDocs(query(collection(db, 'chatMessages'), where('channelId', '==', ch.id), orderBy('sentAt', 'desc'), limit(1)));
      const latest = msgSnap.empty ? undefined : ({ id: msgSnap.docs[0]!.id, ...msgSnap.docs[0]!.data() } as ChatMessage);
      const latestMs = latest?.sentAt ? ((latest.sentAt as any).toMillis?.() ?? (latest.sentAt as any).seconds * 1000) : 0;
      return { channel: ch, lastText: previewOf(latest), unread: latestMs > (lastRead[ch.id] ?? 0) };
    }));
    setRows(built);
    setLoading(false);
  }, [selectedDancer?.id, user?.uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleNotif = async (ch: ChatChannel) => {
    if (!selectedDancer) return;
    const enabled = selectedDancer.notificationPreferences?.[notifKey(ch.id)] !== false;
    await updateDoc(doc(db, 'dancers', selectedDancer.id), { [`notificationPreferences.${notifKey(ch.id)}`]: !enabled });
  };

  const notifEnabled = (ch: ChatChannel) => selectedDancer?.notificationPreferences?.[notifKey(ch.id)] !== false;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <LinearGradient colors={['#2F86C0', '#2F86C0', '#7FBFE3', '#D8EAF3', Colors.background]}
          locations={[0, 0.32, 0.58, 0.8, 0.97]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.headerWave} pointerEvents="none">
          <Svg width="100%" height="100%" viewBox="0 0 400 44" preserveAspectRatio="none">
            <Path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" fill={Colors.background} />
          </Svg>
        </View>
        <TouchableOpacity style={styles.headerRow} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.headerTitle}>Discussion</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.empty}>Chargement…</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>Aucun canal disponible.</Text>
        ) : (
          <View style={styles.card}>
            {rows.map(({ channel: ch, lastText, unread }, i) => (
              <View key={ch.id}>
                {i > 0 && <View style={styles.divider} />}
                <TouchableOpacity style={[styles.row, unread && styles.rowUnread]} activeOpacity={0.7}
                  onPress={() => router.push(`/dancer/${id}/chat/${ch.id}` as any)}>
                  <View>
                    <View style={styles.rowIcon}>
                      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                        <Path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="#534AB7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                    {unread && <View style={styles.unreadDot} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowName, unread && styles.rowNameUnread]} numberOfLines={1}>{ch.name}</Text>
                    <Text style={styles.rowPreview} numberOfLines={1}>{lastText}</Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleNotif(ch)} hitSlop={10}>
                    {notifEnabled(ch) ? (
                      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3C7.7 6.2 6 8.4 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" stroke="#5A5A6A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                    ) : (
                      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3C7.7 6.2 6 8.4 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" stroke="#C9CBD1" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><Path d="M3 3l18 18" stroke="#C9CBD1" strokeWidth={1.8} strokeLinecap="round" /></Svg>
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.adminBtn} onPress={() => router.push(`/dancer/${id}/chat/admin` as any)} activeOpacity={0.8}>
          <View>
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"><Path d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="#5A5A6A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            {adminUnread && <View style={styles.adminUnreadDot} />}
          </View>
          <Text style={styles.adminBtnText}>Message à l'administration</Text>
        </TouchableOpacity>

        {/* Boite de reception du club — visible pour ceux qui ont la permission
            /admin/private-messages, soit admin et bureau. Le role peut etre
            porte par le compte OU par la fiche danseur : ne regarder que l'un
            des deux masquerait la fonctionnalite a une partie du bureau. */}
        {isStaff && (
          <TouchableOpacity
            style={styles.adminBtn}
            onPress={() => router.push(`/dancer/${id}/chat/inbox` as any)}
            activeOpacity={0.8}
          >
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <Path d="M4 4h16v12H5.2L4 17.2V4z" stroke="#5A5A6A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={styles.adminBtnText}>Messages privés des danseurs</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <BottomTabBar dancerId={id} qrValue={id} active="chat" bottomInset={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 50, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },

  card: { marginHorizontal: 16, marginTop: 6, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' },
  divider: { height: 1, backgroundColor: '#F1EFE8', marginHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowUnread: { backgroundColor: '#F8FBFE' },
  rowIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#EEEDFE', alignItems: 'center', justifyContent: 'center' },
  unreadDot: { position: 'absolute', top: -3, right: -3, width: 11, height: 11, borderRadius: 6, backgroundColor: Colors.orange, borderWidth: 2, borderColor: '#fff' },
  rowName: { fontSize: 14, fontWeight: '500', color: Colors.text },
  rowNameUnread: { fontWeight: '700' },
  rowPreview: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  adminBtn: { marginHorizontal: 16, marginTop: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', backgroundColor: '#fff', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  adminBtnText: { color: '#5A5A6A', fontSize: 14, fontWeight: '500' },
  adminUnreadDot: { position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.orange, borderWidth: 1.5, borderColor: '#fff' },

  empty: { textAlign: 'center', color: Colors.textSecondary, fontSize: 14, paddingVertical: 40 },
});
