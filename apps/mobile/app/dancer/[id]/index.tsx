import { useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

  useEffect(() => {
    getDocs(
      query(collection(db, 'announcements'), orderBy('sentAt', 'desc'), limit(3))
    ).then(snap => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
    }).catch(() => {});
  }, []);

  const nav = (screen: string) => router.push(`/dancer/${id}/${screen}` as any);

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
          {/* Dégradé bleu → crème */}
          <LinearGradient
            colors={['#2F86C0', '#7FBFE3', '#D8EAF3', Colors.background]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Vague douce en bas */}
          <View style={styles.headerWave} pointerEvents="none">
            <Svg width="100%" height="100%" viewBox="0 0 400 44" preserveAspectRatio="none">
              <Path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" fill={Colors.background} />
            </Svg>
          </View>

          <View style={styles.headerTop}>
            {/* Photo */}
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

            {/* QR Code */}
            {hasPerm('/dancer/card') && (
              <TouchableOpacity style={styles.qrBlock} onPress={() => nav('card')} activeOpacity={0.85}>
                <Text style={styles.qrLabel}>Mon QR Code</Text>
                <View style={styles.qrBox}>
                  <QRCode
                    value={selectedDancer.id}
                    size={80}
                    color="white"
                    backgroundColor={Colors.orange}
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
            <View style={styles.actuBadge}>
              <Text style={styles.actuBadgeText}>Actualités</Text>
            </View>
            <View style={styles.actuCard}>
              {announcements.length === 0 ? (
                <Text style={styles.actuEmpty}>Aucune actualité pour le moment.</Text>
              ) : (
                announcements.map(a => (
                  <View key={a.id} style={styles.actuItem}>
                    <Text style={styles.actuTitle}>{a.title}</Text>
                    <Text style={styles.actuBody}>{a.body}</Text>
                  </View>
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
        </View>
      </ScrollView>

      <BottomTabBar dancerId={id!} bottomInset={insets.bottom} />
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
    backgroundColor: Colors.orange,
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
  actuBadge: {
    position: 'absolute',
    top: -14,
    left: 16,
    zIndex: 1,
    backgroundColor: Colors.orange,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  actuBadgeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
  actuItem: { marginBottom: 10 },
  actuTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  actuBody: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },

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

});
