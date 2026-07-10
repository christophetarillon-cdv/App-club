import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, getDocs, updateDoc, Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Audio } from 'expo-av';
import VideoThumbnail from '@/components/VideoThumbnail';
import VideoPlayerSheet from '@/components/VideoPlayerSheet';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Colors } from '@/constants/Colors';
import type { ChatChannel, ChatMessage, Media } from '@cdv/types';

function notifKey(channelId: string) { return `chat_${channelId}`; }
function timeAgo(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate?.() ?? new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function AudioMessage({ url, mine }: { url: string; mine: boolean }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => () => { soundRef.current?.unloadAsync().catch(() => {}); }, []);
  const toggle = async () => {
    if (!soundRef.current) {
      setLoading(true);
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, st => {
        if ('isLoaded' in st && st.isLoaded) { setPlaying(st.isPlaying ?? false); if (st.didJustFinish) setPlaying(false); }
      });
      soundRef.current = sound; setLoading(false); return;
    }
    if (playing) await soundRef.current.pauseAsync(); else await soundRef.current.playAsync();
  };
  const c = mine ? '#fff' : '#534AB7';
  return (
    <TouchableOpacity style={styles.audioRow} onPress={toggle} activeOpacity={0.8}>
      <View style={[styles.audioBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.25)' : '#EEEDFE' }]}>
        {loading ? <ActivityIndicator color={c} size="small" /> : playing
          ? <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"><Path d="M8 5v14M16 5v14" stroke={c} strokeWidth={2.4} strokeLinecap="round" /></Svg>
          : <View style={[styles.audioTri, { borderLeftColor: c }]} />}
      </View>
      <Text style={[styles.audioLabel, { color: mine ? 'rgba(255,255,255,0.9)' : Colors.textSecondary }]}>Message audio</Text>
    </TouchableOpacity>
  );
}

function DownloadButton({ mine, onPress }: { mine: boolean; onPress: () => void }) {
  const c = mine ? 'rgba(255,255,255,0.92)' : '#534AB7';
  return (
    <TouchableOpacity style={styles.dlBtn} onPress={onPress} activeOpacity={0.7} hitSlop={6}>
      <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
        <Path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <Text style={[styles.dlText, { color: c }]}>Télécharger</Text>
    </TouchableOpacity>
  );
}

export default function ChatChannelScreen() {
  const { id, channelId } = useLocalSearchParams<{ id: string; channelId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, user } = useAuth();
  const { selectedDancer } = useDancer();

  const [channel, setChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<ChatMessage | null>(null);
  const [seasonFloorMs, setSeasonFloorMs] = useState<number | null>(null);
  const bottomRef = useRef<ScrollView>(null);

  useEffect(() => {
    getDoc(doc(db, 'chatChannels', channelId)).then(s => { if (s.exists()) setChannel({ id: s.id, ...s.data() } as ChatChannel); });
  }, [channelId]);

  // Marquer lu
  useEffect(() => {
    if (!selectedDancer) return;
    updateDoc(doc(db, 'dancers', selectedDancer.id), { [`chatLastRead.${channelId}`]: Date.now() }).catch(() => {});
  }, [channelId, selectedDancer?.id]);

  // Plancher de date : début du bloc de saisons consécutives le plus récent de l'utilisateur.
  // Exemple : validé 2024-25 ✓, 2025-26 ✗, 2026-27 ✓ → plancher = début 2026-27 (le trou bloque).
  useEffect(() => {
    if (!user) return;
    const isAdminOrInstructor =
      (account?.roles ?? []).includes('admin') ||
      (selectedDancer?.roles ?? []).includes('admin') ||
      (selectedDancer?.roles ?? []).includes('instructor');
    if (isAdminOrInstructor) { setSeasonFloorMs(0); return; }
    Promise.all([
      getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
      getDocs(collection(db, 'seasons')),
    ]).then(([membershipSnap, seasonSnap]) => {
      // Map seasonId → createdAt (date d'adhésion effective)
      const membershipBySeason = new Map<string, number | undefined>();
      membershipSnap.docs
        .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
        .forEach(d => {
          const sid = d.data().seasonId as string | undefined;
          if (sid) membershipBySeason.set(sid, d.data().createdAt?.seconds as number | undefined);
        });
      const paidIds = new Set(membershipBySeason.keys());

      // Trier toutes les saisons par startDate, en ignorant celles sans date
      const sortedSeasons = seasonSnap.docs
        .map(d => ({ id: d.id, startSec: d.data().startDate?.seconds ?? 0 }))
        .filter(s => s.startSec > 0)
        .sort((a, b) => a.startSec - b.startSec);

      if (sortedSeasons.length === 0 || paidIds.size === 0) {
        setSeasonFloorMs(Date.now());
        return;
      }
      // Saisons validées par l'utilisateur, triées
      const userSeasons = sortedSeasons.filter(s => paidIds.has(s.id));
      if (userSeasons.length === 0) { setSeasonFloorMs(Date.now()); return; }

      // Partir de la saison la plus récente et remonter tant que les saisons sont consécutives
      const mostRecent = userSeasons[userSeasons.length - 1]!;
      // Pour la saison la plus récente : plancher = max(début de saison, date d'adhésion)
      // → un nouveau membre ne voit pas les messages antérieurs à son adhésion
      const joinedAtSec = membershipBySeason.get(mostRecent.id);
      let floorSec = joinedAtSec != null && joinedAtSec > mostRecent.startSec
        ? joinedAtSec
        : mostRecent.startSec;

      let idx = sortedSeasons.findIndex(s => s.id === mostRecent.id);
      while (idx > 0) {
        const prev = sortedSeasons[idx - 1]!;
        if (paidIds.has(prev.id)) { floorSec = prev.startSec; idx--; } else break;
      }
      setSeasonFloorMs(floorSec * 1000);
    });
  }, [user?.uid, account?.roles?.join(','), selectedDancer?.id]);

  useEffect(() => {
    if (seasonFloorMs === null) return;
    const q = seasonFloorMs > 0
      ? query(
          collection(db, 'chatMessages'),
          where('channelId', '==', channelId),
          where('sentAt', '>=', Timestamp.fromMillis(seasonFloorMs)),
          orderBy('sentAt', 'asc'),
        )
      : query(collection(db, 'chatMessages'), where('channelId', '==', channelId), orderBy('sentAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
      setTimeout(() => bottomRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return unsub;
  }, [channelId, seasonFloorMs]);

  const userRoles = [...(account?.roles ?? []), ...(selectedDancer?.roles ?? [])];
  const isAdmin = userRoles.includes('admin');
  const canPublish = !!channel && !!selectedDancer && (
    isAdmin || channel.publisherType === 'all_members' ||
    (channel.publisherType === 'specific_dancers' && (channel.publisherIds ?? []).includes(selectedDancer.id))
  );
  const notifEnabled = selectedDancer?.notificationPreferences?.[notifKey(channelId)] !== false;

  const toggleNotif = () => {
    if (!selectedDancer) return;
    updateDoc(doc(db, 'dancers', selectedDancer.id), { [`notificationPreferences.${notifKey(channelId)}`]: !notifEnabled });
  };

  const sendText = async () => {
    if (!selectedDancer || !text.trim()) return;
    setSending(true);
    await addDoc(collection(db, 'chatMessages'), {
      channelId, authorId: selectedDancer.id,
      authorName: `${selectedDancer.firstName} ${selectedDancer.lastName}`,
      authorPhotoUrl: selectedDancer.photoUrl ?? null,
      text: text.trim(), sentAt: serverTimestamp(),
    });
    setText(''); setSending(false);
  };

  const uploadAndSend = async (uri: string, fileName: string, mediaType: 'image' | 'video' | 'audio' | undefined) => {
    if (!selectedDancer) return;
    setUploading(true);
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `chat/${channelId}/${Date.now()}_${safe}`;
      await uploadBytes(ref(storage, path), blob);
      const mediaUrl = await getDownloadURL(ref(storage, path));
      await addDoc(collection(db, 'chatMessages'), {
        channelId, authorId: selectedDancer.id,
        authorName: `${selectedDancer.firstName} ${selectedDancer.lastName}`,
        authorPhotoUrl: selectedDancer.photoUrl ?? null,
        mediaUrl, ...(mediaType ? { mediaType } : {}), fileName, sentAt: serverTimestamp(),
      });
    } catch { Alert.alert('Erreur', 'Envoi du fichier impossible.'); }
    finally { setUploading(false); }
  };

  const pickMedia = async () => {
    setAttachOpen(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      await uploadAndSend(a.uri, a.fileName ?? `media_${Date.now()}`, a.type === 'video' ? 'video' : 'image');
    } catch {
      Alert.alert('Erreur', "Impossible d'ouvrir la galerie.");
    }
  };

  const pickDocument = async () => {
    setAttachOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      const mime = a.mimeType ?? '';
      const mt = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : undefined;
      await uploadAndSend(a.uri, a.name ?? `fichier_${Date.now()}`, mt);
    } catch {
      Alert.alert('Erreur', "Impossible d'ouvrir le sélecteur de fichiers.");
    }
  };

  const downloadMedia = async (m: ChatMessage) => {
    if (!m.mediaUrl) return;
    try {
      const safe = (m.fileName ?? 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_');
      const dest = `${FileSystem.cacheDirectory}${Date.now()}_${safe}`;
      // Téléchargement resumable : reprend si l'app passe en arrière-plan / veille.
      const dl = FileSystem.createDownloadResumable(m.mediaUrl, dest, {});
      const result = await dl.downloadAsync();
      const uri = result?.uri;
      if (!uri) throw new Error('Téléchargement échoué');
      if (m.mediaType === 'image' || m.mediaType === 'video') {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (perm.granted) { await MediaLibrary.saveToLibraryAsync(uri); Alert.alert('Enregistré', 'Ajouté à ta galerie.'); return; }
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Erreur', "Le partage n'est pas disponible sur cet appareil.");
      }
    } catch (err) {
      console.error('downloadMedia failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Erreur', `Téléchargement impossible.\n${msg}`);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerLeft} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{channel?.name ?? '…'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleNotif} hitSlop={10}>
            {notifEnabled ? (
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3C7.7 6.2 6 8.4 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            ) : (
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3C7.7 6.2 6 8.4 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" stroke="rgba(255,255,255,0.55)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><Path d="M3 3l18 18" stroke="rgba(255,255,255,0.55)" strokeWidth={1.8} strokeLinecap="round" /></Svg>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <ScrollView ref={bottomRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 20 }}>
        {messages.length === 0 ? (
          <Text style={styles.empty}>Aucun message pour l'instant.</Text>
        ) : messages.map(m => {
          const mine = m.authorId === selectedDancer?.id;
          const initials = m.authorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          const isFile = !!m.mediaUrl && m.mediaType !== 'image' && m.mediaType !== 'video' && m.mediaType !== 'audio';
          return (
            <View key={m.id} style={[styles.msgRow, mine && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.avatar, { backgroundColor: mine ? '#2F86C0' : '#9CA3AF' }]}>
                {m.authorPhotoUrl ? <Image source={{ uri: m.authorPhotoUrl }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{initials}</Text>}
              </View>
              <View style={{ maxWidth: '76%' }}>
                <Text style={[styles.msgMeta, mine && { textAlign: 'right' }]}>{mine ? 'Moi' : m.authorName.split(' ')[0]} · {timeAgo(m.sentAt)}</Text>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  {m.text ? <Text style={[styles.msgText, mine && { color: '#fff' }]}>{m.text}</Text> : null}
                  {m.mediaType === 'image' && m.mediaUrl && (
                    <View>
                      <Image source={{ uri: m.mediaUrl }} style={styles.msgImage} resizeMode="cover" />
                      <DownloadButton mine={mine} onPress={() => downloadMedia(m)} />
                    </View>
                  )}
                  {m.mediaType === 'video' && m.mediaUrl && (
                    <View>
                      <TouchableOpacity style={styles.videoThumb} activeOpacity={0.9} onPress={() => setActiveVideo(m)}>
                        <VideoThumbnail videoUrl={m.mediaUrl} fallbackColor="#1A1A2E" />
                        <View style={styles.playOverlay} pointerEvents="none">
                          <View style={styles.playCircle}><View style={styles.playTri} /></View>
                        </View>
                      </TouchableOpacity>
                      <DownloadButton mine={mine} onPress={() => downloadMedia(m)} />
                    </View>
                  )}
                  {m.mediaType === 'audio' && m.mediaUrl && (
                    <View>
                      <AudioMessage url={m.mediaUrl} mine={mine} />
                      <DownloadButton mine={mine} onPress={() => downloadMedia(m)} />
                    </View>
                  )}
                  {isFile && (
                    <TouchableOpacity style={[styles.fileChip, { backgroundColor: mine ? 'rgba(255,255,255,0.16)' : '#F1EFE8' }]} onPress={() => downloadMedia(m)} activeOpacity={0.8}>
                      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="M9 12h6M9 16h6M9 8h3M6 2h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z" stroke={mine ? '#fff' : '#5A5A6A'} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                      <Text style={[styles.fileName, { color: mine ? '#fff' : Colors.text }]} numberOfLines={1}>{m.fileName ?? 'Fichier'}</Text>
                      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" stroke={mine ? '#fff' : '#5A5A6A'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Composer */}
      {canPublish ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity style={styles.attachBtn} onPress={() => setAttachOpen(true)} disabled={uploading}>
            {uploading ? <ActivityIndicator color="#5A5A6A" /> : (
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M21.4 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="#5A5A6A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            )}
          </TouchableOpacity>
          <TextInput style={styles.input} value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor={Colors.textLight} multiline />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]} disabled={!text.trim() || sending} onPress={sendText}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.readonly, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={styles.readonlyText}>Vous êtes en lecture seule sur ce canal.</Text>
        </View>
      )}

      {/* Menu pièce jointe — in-screen (pas de Modal pour ne pas bloquer le picker iOS) */}
      {attachOpen && (
        <Pressable style={styles.sheetOverlay} onPress={() => setAttachOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
            <TouchableOpacity style={styles.sheetItem} onPress={pickMedia}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM3 16l5-5 4 4 3-3 6 6" stroke="#2F86C0" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
              <Text style={styles.sheetText}>Photo ou vidéo</Text>
            </TouchableOpacity>
            <View style={styles.sheetDivider} />
            <TouchableOpacity style={styles.sheetItem} onPress={pickDocument}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M9 12h6M9 16h6M9 8h3M6 2h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="#534AB7" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>
              <Text style={styles.sheetText}>Document (PDF, fichier…)</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}

      {/* Lecteur vidéo plein écran (même composant que la page Vidéos) */}
      {activeVideo?.mediaUrl && (
        <VideoPlayerSheet
          video={{
            sourceUrl: activeVideo.mediaUrl,
            title: activeVideo.fileName || 'Vidéo',
            description: '',
          } as unknown as Media}
          styleColor="#2F86C0"
          seasonBadge={activeVideo.authorName.split(' ')[0]}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: '#2F86C0', paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 12 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600', flex: 1 },

  empty: { textAlign: 'center', color: Colors.textSecondary, fontSize: 14, paddingVertical: 40 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 30, height: 30, borderRadius: 15 },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  msgMeta: { fontSize: 11, color: Colors.textSecondary, marginBottom: 3 },
  bubble: { borderRadius: 14, padding: 10 },
  bubbleMine: { backgroundColor: '#2F86C0', borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderTopLeftRadius: 4 },
  msgText: { fontSize: 14, color: Colors.text },
  msgImage: { width: 200, height: 150, borderRadius: 10, marginTop: 6 },
  videoThumb: { width: 220, height: 150, borderRadius: 12, overflow: 'hidden', marginTop: 6, backgroundColor: '#1A1A2E' },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  playTri: { width: 0, height: 0, borderLeftWidth: 16, borderTopWidth: 10, borderBottomWidth: 10, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginLeft: 4 },

  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, paddingVertical: 2 },
  audioBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  audioTri: { width: 0, height: 0, borderLeftWidth: 11, borderTopWidth: 7, borderBottomWidth: 7, borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 3 },
  audioLabel: { fontSize: 13 },

  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 8, marginTop: 6, minWidth: 180 },
  fileName: { flex: 1, fontSize: 13 },

  dlBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', paddingVertical: 2 },
  dlText: { fontSize: 12, fontWeight: '500' },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  attachBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 21, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 11, fontSize: 14, color: Colors.text },
  sendBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#2F86C0', alignItems: 'center', justifyContent: 'center' },

  readonly: { paddingTop: 12, paddingHorizontal: 16, backgroundColor: '#F1EFE8', alignItems: 'center' },
  readonlyText: { fontSize: 13, color: Colors.textSecondary },

  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', zIndex: 100 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8, paddingHorizontal: 8 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 14 },
  sheetText: { fontSize: 16, color: Colors.text },
  sheetDivider: { height: 1, backgroundColor: '#F1EFE8', marginHorizontal: 14 },
});
