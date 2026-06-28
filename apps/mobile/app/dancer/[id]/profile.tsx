import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import BottomTabBar from '@/components/BottomTabBar';

interface MenuItem {
  permKey: string | null;
  requiredRoles?: string[];
  label: string;
  subtitle: string;
  screen: string;
  accentColor: string;
  bgColor: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    permKey: '/my-documents',
    label: 'Mes documents',
    subtitle: "Reçus, attestations, factures",
    screen: 'my-documents',
    accentColor: '#3B6D11',
    bgColor: '#EAF3DE',
  },
  {
    permKey: '/library',
    label: 'Bibliothèque du club',
    subtitle: 'Documents partagés par le club',
    screen: 'library',
    accentColor: '#534AB7',
    bgColor: '#EEEDFE',
  },
  {
    permKey: '/membership',
    label: 'Ma cotisation',
    subtitle: "Adhésion et paiements",
    screen: 'membership',
    accentColor: '#E8951F',
    bgColor: '#FFF3E0',
  },
  {
    permKey: '/trombinoscope',
    label: 'Trombinoscope',
    subtitle: 'Photos des membres du club',
    screen: 'trombinoscope',
    accentColor: '#0E7490',
    bgColor: '#CFFAFE',
  },
  {
    permKey: null,
    label: 'Mon profil',
    subtitle: 'Informations personnelles',
    screen: 'infos',
    accentColor: '#185FA5',
    bgColor: '#E8F4FD',
  },
  {
    permKey: '/instructor/stats',
    requiredRoles: ['admin', 'instructor'],
    label: 'Statistiques',
    subtitle: 'Présences par cours et semaine',
    screen: 'stats',
    accentColor: '#7C3AED',
    bgColor: '#EDE9FE',
  },
  {
    permKey: null,
    requiredRoles: ['admin', 'bureau'],
    label: 'Paramètres',
    subtitle: 'Administration du club',
    screen: 'settings',
    accentColor: '#6B7280',
    bgColor: '#F3F4F6',
  },
];

function MenuIcon({ screen, color }: { screen: string; color: string }) {
  if (screen === 'my-documents') return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="14 2 14 8 20 8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={16} y1={13} x2={8} y2={13} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={16} y1={17} x2={8} y2={17} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
  if (screen === 'library') return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M4 19.5A2.5 2.5 0 016.5 17H20"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  if (screen === 'membership') return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={1} y={4} width={22} height={16} rx={2}
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={1} y1={10} x2={23} y2={10} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
  if (screen === 'stats') return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M18 20V10" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 20V4"  stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 20v-6"  stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  if (screen === 'settings') return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />
      <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  if (screen === 'trombinoscope') return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={7} r={3} stroke={color} strokeWidth={1.8} />
      <Path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={17} cy={8} r={2.5} stroke={color} strokeWidth={1.8} />
      <Path d="M21 21v-1.5a3.5 3.5 0 00-2.5-3.35" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={7} r={4} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account } = useAuth();
  const { selectedDancer } = useDancer();

  const [pagePermissions, setPagePermissions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'main'))
      .then(snap => {
        if (snap.exists()) {
          setPagePermissions((snap.data().pagePermissions ?? {}) as Record<string, string[]>);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const userRoles = selectedDancer?.roles ?? [];
  const isAdmin = userRoles.includes('admin');

  const hasPerm = (permKey: string | null): boolean => {
    if (!permKey) return true;
    if (isAdmin) return true;
    if (!(permKey in pagePermissions)) return true;
    const allowed = pagePermissions[permKey] ?? [];
    return userRoles.some(r => allowed.includes(r));
  };

  const hasRequiredRoles = (requiredRoles?: string[]): boolean => {
    if (!requiredRoles) return true;
    return userRoles.some(r => requiredRoles.includes(r));
  };

  const visibleItems = MENU_ITEMS.filter(
    item => hasPerm(item.permKey) && hasRequiredRoles(item.requiredRoles),
  );

  return (
    <View style={styles.root}>
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
          <Text style={styles.headerTitle}>Mon espace</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
          ) : (
            visibleItems.map(item => (
              <TouchableOpacity
                key={item.screen}
                style={styles.card}
                onPress={() => router.push(`/dancer/${id}/${item.screen}` as any)}
                activeOpacity={0.82}
              >
                <View style={[styles.iconWrap, { backgroundColor: item.bgColor }]}>
                  <MenuIcon screen={item.screen} color={item.accentColor} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardLabel}>{item.label}</Text>
                  <Text style={styles.cardSub}>{item.subtitle}</Text>
                </View>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path d="M9 18l6-6-6-6" stroke="#ccc" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <BottomTabBar dancerId={id} bottomInset={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 56, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },

  content: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: { flex: 1 },
  cardLabel: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 12, color: Colors.textSecondary },
});
