import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput,
  KeyboardAvoidingView, Platform, Alert,
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
  // Ecran a double usage :
  //  - sans parametre, le danseur consulte SA conversation avec le club ;
  //  - avec targetDancerId, un admin/bureau consulte celle d'un danseur et y
  //    repond au nom du club.
  // Reutiliser le meme ecran plutot que d'en creer un second evite de
  // dupliquer l'affichage des bulles — et donc de reintroduire les bugs
  // d'affichage Android corriges dans ce fichier.
  const { id, targetDancerId, targetAccountId, targetName } = useLocalSearchParams<{
    id: string; targetDancerId?: string; targetAccountId?: string; targetName?: string;
  }>();
  const isAdminView = !!targetDancerId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, account } = useAuth();
  const { selectedDancer } = useDancer();

  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<FlatList>(null);
  // Miroir synchrone de `text` : sur Android, taper le dernier mot puis
  // taper tres vite sur Envoyer peut faire lire a `send()` une valeur de
  // state pas encore a jour (le dernier mot manque a l'envoi). Une ref est
  // ecrite de facon synchrone dans onChangeText, donc toujours a jour.
  const textRef = useRef('');
  const updateText = (t: string) => { textRef.current = t; setText(t); };

  useEffect(() => {
    // Scope par danseur (pas juste par compte) : sur un compte famille avec
    // plusieurs danseurs, chacun ne doit voir que sa propre conversation.
    if (!user) return;
    if (!isAdminView && !selectedDancer) return;
    // Vue admin : la regle passe par hasPagePermission(), qui ne depend pas du
    // document — un filtre sur le seul fromDancerId est donc prouvable.
    // Vue danseur : fromAccountId doit etre filtre EN PLUS de fromDancerId. La
    // regle autorise la lecture si `fromAccountId == request.auth.uid`, et
    // Firestore ne peut la prouver que si la requete contraint elle-meme ce
    // champ. Sans ce filtre, toute la requete est rejetee pour un danseur non
    // admin — l'ecran n'affiche alors que les messages ecrits pendant la
    // session (cache local), sans historique ni reponse du club.
    const q = isAdminView
      ? query(
          collection(db, 'privateMessages'),
          where('fromDancerId', '==', targetDancerId),
          orderBy('sentAt', 'asc'),
        )
      : query(
          collection(db, 'privateMessages'),
          where('fromDancerId', '==', selectedDancer!.id),
          where('fromAccountId', '==', user.uid),
          orderBy('sentAt', 'asc'),
        );
    const unsub = onSnapshot(
      q,
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as PrivateMessage)));
      },
      error => {
        // Sans ce handler, un refus des regles est silencieux : l'ecran reste
        // sur les seuls messages du cache local, ce qui masque la cause.
        console.error('privateMessages listener error', error);
      },
    );
    return unsub;
  }, [user?.uid, selectedDancer?.id, targetDancerId]);

  // Marquage "lu", dans les deux sens : le danseur marque les reponses du
  // club (readByDancerAt), le club marque les messages du danseur (readAt) —
  // c'est ce dernier qui alimente la pastille de non-lus cote admin.
  useEffect(() => {
    const unread = isAdminView
      ? messages.filter(m => !m.fromAdmin && !m.readAt)
      : messages.filter(m => m.fromAdmin && !m.readByDancerAt);
    if (unread.length === 0) return;
    const field = isAdminView ? 'readAt' : 'readByDancerAt';
    // .catch obligatoire : un refus des regles remontait en promesse non
    // capturee, ce qui affichait une erreur plein ecran par-dessus le chat.
    // Le marquage "lu" est accessoire, son echec ne doit rien bloquer.
    Promise.all(
      unread.map(m => updateDoc(doc(db, 'privateMessages', m.id), { [field]: serverTimestamp() })),
    ).catch(error => console.error(`${field} update failed`, error));
  }, [messages, isAdminView]);

  const send = async () => {
    const value = textRef.current.trim();
    if (!user || !value || sending) return;
    if (!isAdminView && !selectedDancer) return;
    setSending(true);
    try {
      // En vue admin, le fil reste identifie par le DANSEUR (fromDancerId /
      // fromAccountId inchanges) : c'est fromAdmin qui distingue la reponse du
      // club. Ecrire l'uid de l'admin casserait le rattachement du fil.
      await addDoc(collection(db, 'privateMessages'), {
        fromDancerId: isAdminView ? targetDancerId : selectedDancer!.id,
        fromDancerName: isAdminView
          ? (targetName ?? 'Danseur')
          : `${selectedDancer!.firstName} ${selectedDancer!.lastName}`,
        fromAccountId: isAdminView ? targetAccountId : user.uid,
        ...(isAdminView ? { fromAdmin: true } : {}),
        text: value,
        // Timestamp client (pas serverTimestamp) : evite le placeholder null
        // pendant l'ecriture optimiste, qui retardait l'affichage du message
        // dans la liste triee par sentAt.
        sentAt: Timestamp.now(),
      });
      updateText('');
    } catch (error) {
      // Sans ce catch, un envoi refuse restait invisible : la zone de saisie
      // se vidait et le message semblait parti alors qu'il n'existait pas.
      console.error('send private message failed', error);
      Alert.alert('Message non envoyé', "Vérifiez votre connexion et réessayez.");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      // meme reglage que login.tsx / membership-create.tsx : le resize natif
      // seul ne suffit pas sous Android edge-to-edge (SDK 54+).
      keyboardVerticalOffset={Platform.OS === 'android' ? 120 : 0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerRow} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {isAdminView ? (targetName ?? 'Conversation') : "Message à l'administration"}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={bottomRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
        onContentSizeChange={() => bottomRef.current?.scrollToEnd({ animated: true })}
        data={messages}
        keyExtractor={m => m.id}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isAdminView
              ? 'Aucun message dans cette conversation.'
              : "Envoyez un message à l'administration du club, vous recevrez sa réponse ici."}
          </Text>
        }
        renderItem={({ item: m }) => {
          // "mine" = message ecrit par celui qui regarde : le club en vue
          // admin, le danseur sinon. Les bulles s'inversent en consequence.
          const mine = isAdminView ? !!m.fromAdmin : !m.fromAdmin;
          const who = m.fromAdmin ? 'Administration' : (targetName ?? 'Danseur');
          return (
          <View style={[styles.msgRow, mine && { flexDirection: 'row-reverse' }]}>
            <View style={styles.msgWrap}>
              <Text style={[styles.msgMeta, mine && { textAlign: 'right' }]}>
                {mine ? 'Moi' : (isAdminView ? who : 'Administration')} · {timeAgo(m.sentAt)}
              </Text>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                <Text style={[styles.msgText, mine && { color: '#fff' }]}>{m.text}</Text>
              </View>
            </View>
          </View>
          );
        }}
      />

      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={updateText}
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

  // Structure alignee sur kdanse-app (ChannelScreen), seule version dont on
  // ait la preuve qu'elle s'affiche correctement sur le Samsung concerne :
  // alignItems flex-end, maxWidth 72%, padding H/V distincts, fontSize 15 /
  // lineHeight 22. Ne pas revenir a des valeurs "equivalentes" sans retester
  // sur cet appareil.
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  msgWrap: { maxWidth: '72%' },
  msgMeta: { fontSize: 11, color: Colors.textSecondary, marginBottom: 3 },
  bubble: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#2F86C0', borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderTopLeftRadius: 4 },
  msgText: { fontSize: 15, lineHeight: 22, color: Colors.text },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 21, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 11, fontSize: 14, color: Colors.text },
  sendBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#2F86C0', alignItems: 'center', justifyContent: 'center' },
});
