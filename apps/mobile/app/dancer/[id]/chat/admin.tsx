import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '@/constants/Colors';
import type { PrivateMessage } from '@cdv/types';

function timeAgo(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate?.() ?? new Date(ts.seconds * 1000);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function AdminConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { selectedDancer } = useDancer();

  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Scope par danseur (pas juste par compte) : sur un compte famille avec
    // plusieurs danseurs, chacun ne doit voir que sa propre conversation.
    if (!user || !selectedDancer) return;
    const q = query(
      collection(db, 'privateMessages'),
      where('fromDancerId', '==', selectedDancer.id),
      orderBy('sentAt', 'asc'),
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as PrivateMessage)));
    });
    return unsub;
  }, [user?.uid, selectedDancer?.id]);

  // Marque comme lues les reponses admin non encore vues par le danseur.
  useEffect(() => {
    const unread = messages.filter(m => m.fromAdmin && !m.readByDancerAt);
    if (unread.length === 0) return;
    Promise.all(unread.map(m => updateDoc(doc(db, 'privateMessages', m.id), { readByDancerAt: serverTimestamp() })));
  }, [messages]);

  const send = async () => {
    if (!user || !selectedDancer || !text.trim() || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'privateMessages'), {
        fromDancerId: selectedDancer.id,
        fromDancerName: `${selectedDancer.firstName} ${selectedDancer.lastName}`,
        fromAccountId: user.uid,
        text: text.trim(),
        // Timestamp client (pas serverTimestamp) : evite le placeholder null
        // pendant l'ecriture optimiste, qui retardait l'affichage du message
        // dans la liste triee par sentAt.
        sentAt: Timestamp.now(),
      });
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android' ? 120 : 0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerRow} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.headerTitle}>Message à l'administration</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={bottomRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
        onContentSizeChange={() => bottomRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <Text style={styles.empty}>
            Envoyez un message à l'administration du club, vous recevrez sa réponse ici.
          </Text>
        ) : messages.map(m => (
          <View key={m.id} style={[styles.msgRow, { alignItems: m.fromAdmin ? 'flex-start' : 'flex-end' }]}>
            <Text style={[styles.msgMeta, !m.fromAdmin && { textAlign: 'right' }]}>
              {m.fromAdmin ? 'Administration' : 'Moi'} · {timeAgo(m.sentAt)}
            </Text>
            <View style={[styles.bubble, !m.fromAdmin ? styles.bubbleMine : styles.bubbleOther]}>
              <Text style={[styles.msgText, !m.fromAdmin && { color: '#fff' }]}>{m.text}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          placeholderTextColor={Colors.textLight}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
          disabled={!text.trim() || sending}
          onPress={send}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: '#2F86C0', paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600', flex: 1 },

  empty: { textAlign: 'center', color: Colors.textSecondary, fontSize: 14, paddingVertical: 40, paddingHorizontal: 16 },

  msgRow: { marginBottom: 12, width: '100%' },
  msgMeta: { fontSize: 11, color: Colors.textSecondary, marginBottom: 3 },
  bubble: { borderRadius: 14, padding: 10, maxWidth: '80%', flexShrink: 1 },
  bubbleMine: { backgroundColor: '#2F86C0', borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderTopLeftRadius: 4 },
  msgText: { fontSize: 14, color: Colors.text, flexShrink: 1 },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 21, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 11, fontSize: 14, color: Colors.text },
  sendBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#2F86C0', alignItems: 'center', justifyContent: 'center' },
});
