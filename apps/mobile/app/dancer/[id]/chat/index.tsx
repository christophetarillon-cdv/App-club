import { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  collection, getDocs, getDoc, query, where, orderBy, limit, doc, updateDoc, addDoc, serverTimestamp,
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
  const { user } = useAuth();
  const { selectedDancer } = useDancer();

  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminText, setAdminText] = useState('');
  const [sendingAdmin, setSendingAdmin] = useState(false);

  const load = useCallback(async () => {
    if (!selectedDancer) return;
    const chSnap = await getDocs(query(collection(db, 'chatChannels'), where('isActive', '==', true), orderBy('createdAt', 'asc')));
    const channels = chSnap.docs.map(d => ({ id: d.id, ...d.data() } as ChatChannel));

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
  }, [selectedDancer?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleNotif = async (ch: ChatChannel) => {
    if (!selectedDancer) return;
    const enabled = selectedDancer.notificationPreferences?.[notifKey(ch.id)] !== false;
    await updateDoc(doc(db, 'dancers', selectedDancer.id), { [`notificationPreferences.${notifKey(ch.id)}`]: !enabled });
  };

  const sendAdmin = async () => {
    if (!user || !selectedDancer || !adminText.trim()) return;
    setSendingAdmin(true);
    try {
      await addDoc(collection(db, 'privateMessages'), {
        fromDancerId: selectedDancer.id,
        fromDancerName: `${selectedDancer.firstName} ${selectedDancer.lastName}`,
        fromAccountId: user.uid,
        text: adminText.trim(),
        sentAt: serverTimestamp(),
      });
      setAdminText(''); setAdminOpen(false);
      Alert.alert('Envoyé', "Message transmis à l'administration.");
    } finally { setSendingAdmin(false); }
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

        <TouchableOpacity style={styles.adminBtn} onPress={() => setAdminOpen(true)} activeOpacity={0.8}>
          <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"><Path d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="#5A5A6A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          <Text style={styles.adminBtnText}>Message à l'administration</Text>
        </TouchableOpacity>
      </ScrollView>

      <BottomTabBar dancerId={id} qrValue={id} active="chat" bottomInset={insets.bottom} />

      <Modal visible={adminOpen} transparent animationType="fade" onRequestClose={() => setAdminOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Message à l'administration</Text>
            <TextInput value={adminText} onChangeText={setAdminText} multiline placeholder="Votre message…"
              placeholderTextColor={Colors.textLight} style={styles.modalInput} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setAdminOpen(false)}><Text style={styles.modalCancelText}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalSend, (!adminText.trim() || sendingAdmin) && { opacity: 0.5 }]} disabled={!adminText.trim() || sendingAdmin} onPress={sendAdmin}>
                {sendingAdmin ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSendText}>Envoyer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  empty: { textAlign: 'center', color: Colors.textSecondary, fontSize: 14, paddingVertical: 40 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 18, padding: 18 },
  modalTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 12 },
  modalInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, color: Colors.text, minHeight: 96, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalCancel: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: Colors.textSecondary, fontWeight: '500' },
  modalSend: { flex: 1, backgroundColor: '#2F86C0', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  modalSendText: { color: '#fff', fontWeight: '600' },
});
