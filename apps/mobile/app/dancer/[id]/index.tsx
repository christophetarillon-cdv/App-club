import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, KeyboardAvoidingView, Platform,
  Alert, Keyboard, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  collection, query, orderBy, limit, getDocs,
  addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useDancer } from '@/contexts/DancerContext';
import { usePagePermissions } from '@/contexts/PagePermissionsContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path, Ellipse } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import BottomTabBar from '@/components/BottomTabBar';
import type { Announcement } from '@cdv/types';

// ── Icônes SVG inline ──────────────────────────────────────────────────────

function VideoIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 24 24" fill="none">
      <Path d="M3 6.5C3 5.12 4.12 4 5.5 4h9C15.88 4 17 5.12 17 6.5v11C17 18.88 15.88 20 14.5 20h-9A2.5 2.5 0 013 17.5v-11z" stroke="white" strokeWidth={1.5}/>
      <Path d="M17 9l4-2v10l-4-2V9z" stroke="white" strokeWidth={1.5} strokeLinejoin="round"/>
    </Svg>
  );
}

function AudioIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18V5l12-2v13" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M6 21a3 3 0 100-6 3 3 0 000 6z" stroke="white" strokeWidth={1.5}/>
      <Path d="M18 19a3 3 0 100-6 3 3 0 000 6z" stroke="white" strokeWidth={1.5}/>
    </Svg>
  );
}

function DocIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 24 24" fill="none">
      <Path d="M9 12h6M9 16h6M9 8h3M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="white" strokeWidth={1.5} strokeLinecap="round"/>
    </Svg>
  );
}

function KioskIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 24 24" fill="none">
      <Path d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M13.5 13.5h1.5v1.5h-1.5zM19.5 13.5H21v1.5h-1.5zM13.5 19.5h1.5V21h-1.5zM19.5 19.5H21V21h-1.5zM16.5 16.5H18V18h-1.5z" fill="white"/>
    </Svg>
  );
}

// ── Vague décorative des cartes ────────────────────────────────────────────

function CardWaves() {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 340 90" preserveAspectRatio="none">
      <Ellipse cx={260} cy={90} rx={130} ry={80} fill="rgba(255,255,255,0.08)" />
      <Ellipse cx={300} cy={20} rx={100} ry={70} fill="rgba(255,255,255,0.06)" />
      <Path d="M0 55 Q80 30 160 55 Q240 80 340 50 L340 90 L0 90 Z" fill="rgba(255,255,255,0.07)" />
    </Svg>
  );
}

// ── Composant principal ────────────────────────────────────────────────────

export default function DancerHomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedDancer } = useDancer();
  const { hasPerm } = usePagePermissions();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = selectedDancer?.roles?.includes('admin') ?? false;

  const loadAnnouncements = () => {
    getDocs(
      query(collection(db, 'announcements'), orderBy('sentAt', 'desc'), limit(5))
    ).then(snap => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
    }).catch(() => {});
  };

  useFocusEffect(useCallback(() => { loadAnnouncements(); }, []));

  const nav = (screen: string) => router.push(`/dancer/${id}/${screen}` as any);

  const handleSignOut = () => {
    Alert.alert('Se déconnecter', 'Confirmer la déconnexion ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  const openSheet = () => {
    setTitle('');
    setBody('');
    setSheetOpen(true);
  };

  const closeSheet = () => {
    Keyboard.dismiss();
    setSheetOpen(false);
  };

  const handlePublish = async () => {
    if (!title.trim() || !body.trim() || saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        title: title.trim(),
        body: body.trim(),
        sentAt: serverTimestamp(),
        sentBy: selectedDancer?.id ?? '',
        channelId: '',
        recipientCount: 0,
      });
      closeSheet();
      loadAnnouncements();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (a: Announcement) => {
    Alert.alert(
      'Supprimer cette actualité ?',
      `"${a.title}"`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            await deleteDoc(doc(db, 'announcements', a.id));
            loadAnnouncements();
          },
        },
      ]
    );
  };

  if (!selectedDancer) return null;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Header bleu ── */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <LinearGradient
            colors={['#2F86C0', '#7FBFE3', '#D8EAF3', Colors.background]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.headerWave} pointerEvents="none">
            <Svg width="100%" height="100%" viewBox="0 0 400 44" preserveAspectRatio="none">
              <Path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" fill={Colors.background} />
            </Svg>
          </View>

          <View style={styles.headerTop}>
            <TouchableOpacity style={styles.photoWrapper} onPress={() => nav('infos')} activeOpacity={0.85}>
              {selectedDancer.photoUrl ? (
                <Image source={{ uri: selectedDancer.photoUrl }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoFallback]}>
                  <Text style={styles.photoInitials}>
                    {`${selectedDancer.firstName[0] ?? ''}${selectedDancer.lastName[0] ?? ''}`.toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {hasPerm('/dancer/card') && (
              <TouchableOpacity style={styles.qrBlock} onPress={() => nav('card')} activeOpacity={0.85}>
                <Text style={styles.qrLabel}>Mon QR Code</Text>
                <View style={styles.qrBox}>
                  <QRCode
                    value={selectedDancer.id}
                    size={80}
                    color="#000000"
                    backgroundColor="#FFFFFF"
                  />
                </View>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.welcome}>Bienvenue</Text>
          <Text style={styles.name}>{selectedDancer.firstName}</Text>
        </View>

        {/* ── Actualités ── */}
        <View style={[styles.section, { marginTop: 42 }]}>
          <View style={styles.actu}>
            <View style={styles.actuBadgeRow}>
              <View style={styles.actuBadge}>
                <Text style={styles.actuBadgeText}>Actualités</Text>
              </View>
              {isAdmin && (
                <TouchableOpacity style={styles.actuAddBtn} onPress={openSheet} activeOpacity={0.75}>
                  <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                    <Path d="M7 1v12M1 7h12" stroke="white" strokeWidth={2} strokeLinecap="round"/>
                  </Svg>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.actuCard}>
              {announcements.length === 0 ? (
                <Text style={styles.actuEmpty}>Aucune actualité pour le moment.</Text>
              ) : (
                announcements.map((a, i) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.actuItem, i < announcements.length - 1 && styles.actuItemBorder]}
                    onLongPress={isAdmin ? () => handleDelete(a) : undefined}
                    activeOpacity={isAdmin ? 0.6 : 1}
                    delayLongPress={400}
                  >
                    <Text style={styles.actuTitle}>{a.title}</Text>
                    <Text style={styles.actuBody}>{a.body}</Text>
                    {isAdmin && (
                      <Text style={styles.actuHint}>Appui long pour supprimer</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        </View>

        {/* ── Cartes action ── */}
        <View style={styles.section}>
          {hasPerm('/media') && (
            <TouchableOpacity style={styles.actionCard} onPress={() => nav('videos')} activeOpacity={0.85}>
              <CardWaves />
              <Text style={styles.actionLabel}>Mes vidéos</Text>
              <VideoIcon />
            </TouchableOpacity>
          )}

          {hasPerm('/audio') && (
            <TouchableOpacity style={[styles.actionCard, { marginTop: 12 }]} onPress={() => nav('audios')} activeOpacity={0.85}>
              <CardWaves />
              <Text style={styles.actionLabel}>Mes audios</Text>
              <AudioIcon />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.actionCard, { marginTop: 12 }]} onPress={() => nav('profile')} activeOpacity={0.85}>
            <CardWaves />
            <Text style={styles.actionLabel}>Mon espace</Text>
            <DocIcon />
          </TouchableOpacity>

          {hasPerm('/kiosk') && (
            <TouchableOpacity style={[styles.actionCard, { marginTop: 12 }]} onPress={() => nav('kiosk')} activeOpacity={0.85}>
              <CardWaves />
              <Text style={styles.actionLabel}>Kiosque de pointage</Text>
              <KioskIcon />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.logoutRow} onPress={handleSignOut} activeOpacity={0.75}>
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BottomTabBar dancerId={id!} bottomInset={insets.bottom} />

      {/* ── Bottom sheet création actualité ── */}
      {sheetOpen && (
        <View style={styles.sheetOverlay} pointerEvents="box-none">
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSheet} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.sheetKAV}
          >
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Nouvelle actualité</Text>

              <Text style={styles.sheetLabel}>Titre</Text>
              <TextInput
                style={styles.sheetInput}
                value={title}
                onChangeText={setTitle}
                placeholder="Titre de l'actualité"
                placeholderTextColor={Colors.textSecondary}
                maxLength={100}
                returnKeyType="next"
              />

              <Text style={styles.sheetLabel}>Contenu</Text>
              <TextInput
                style={[styles.sheetInput, styles.sheetTextarea]}
                value={body}
                onChangeText={setBody}
                placeholder="Texte de l'actualité…"
                placeholderTextColor={Colors.textSecondary}
                maxLength={500}
                multiline
                returnKeyType="done"
              />

              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.sheetCancel} onPress={closeSheet}>
                  <Text style={styles.sheetCancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetPublish, (!title.trim() || !body.trim() || saving) && styles.sheetPublishDisabled]}
                  onPress={handlePublish}
                  disabled={!title.trim() || !body.trim() || saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.sheetPublishText}>Publier</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 56,
    overflow: 'hidden',
  },
  headerWave: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 44,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  photoWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: Colors.orange,
    overflow: 'hidden',
    backgroundColor: Colors.white,
  },
  photo: { width: '100%', height: '100%', borderRadius: 48 },
  photoFallback: {
    backgroundColor: Colors.cardTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: { color: '#fff', fontSize: 28, fontWeight: '700' },
  qrBlock: { alignItems: 'flex-end' },
  qrLabel: { fontSize: 13, color: Colors.text, marginBottom: 6 },
  qrBox: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    padding: 8,
  },
  welcome: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.welcomeText,
    marginBottom: 2,
  },
  name: { fontSize: 22, fontWeight: '600', color: Colors.text },

  // Actualités
  section: { paddingHorizontal: 20, marginTop: 28 },
  actu: { position: 'relative' },
  actuBadgeRow: {
    position: 'absolute',
    top: -14,
    left: 16,
    right: 16,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actuBadge: {
    backgroundColor: Colors.orange,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  actuBadgeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  actuAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actuCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 20,
    paddingTop: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  actuEmpty: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  actuItem: { paddingVertical: 8 },
  actuItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F0EDE8' },
  actuTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  actuBody: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  actuHint: { fontSize: 10, color: '#C8C4BC', marginTop: 4 },

  // Action cards
  actionCard: {
    backgroundColor: Colors.cardTeal,
    borderRadius: 18,
    height: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  actionLabel: { fontSize: 17, fontWeight: '700', color: '#fff', flex: 1 },

  logoutRow: { alignItems: 'center', paddingVertical: 18, marginTop: 12 },
  logoutText: { fontSize: 14, fontWeight: '500', color: '#EF4444' },

  // Bottom sheet
  sheetOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  sheetKAV: { width: '100%' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 36, height: 4,
    backgroundColor: '#E0DDD8',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 20 },
  sheetLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  sheetInput: {
    borderWidth: 1,
    borderColor: '#E8E4DF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: '#FAFAF8',
    marginBottom: 16,
  },
  sheetTextarea: { height: 100, textAlignVertical: 'top' },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  sheetCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F0EDE8',
    alignItems: 'center',
  },
  sheetCancelText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  sheetPublish: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.orange,
    alignItems: 'center',
  },
  sheetPublishDisabled: { opacity: 0.45 },
  sheetPublishText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
