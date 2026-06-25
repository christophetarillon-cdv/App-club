import { Linking } from 'react-native';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import BottomTabBar from '@/components/BottomTabBar';
import { useDancer } from '@/contexts/DancerContext';

const WEB_BASE = 'https://app-club-web.vercel.app';

const SECTIONS = [
  {
    title: 'Fonctionnement',
    items: [
      {
        label: 'Planning',
        subtitle: 'Zone scolaire, jours fériés',
        path: '/admin/settings/planning',
        icon: 'calendar',
        color: '#2563EB',
        bg: '#EFF6FF',
      },
      {
        label: 'Séance d\'essai',
        subtitle: 'Durée, limites, texte d\'accueil',
        path: '/admin/settings/trial',
        icon: 'ticket',
        color: '#16A34A',
        bg: '#F0FDF4',
      },
      {
        label: 'QR code d\'accueil',
        subtitle: 'Afficher et imprimer',
        path: '/admin/settings/welcome-qr',
        icon: 'qr',
        color: '#D97706',
        bg: '#FFFBEB',
      },
    ],
  },
  {
    title: 'Profils membres',
    items: [
      {
        label: 'Champs du profil',
        subtitle: 'Affichage et champs obligatoires',
        path: '/admin/settings/profile-fields',
        icon: 'user',
        color: '#7C3AED',
        bg: '#F5F3FF',
      },
      {
        label: 'Champs personnalisés',
        subtitle: 'Schémas et champs custom',
        path: '/admin/settings/custom-fields',
        icon: 'sliders',
        color: '#0891B2',
        bg: '#ECFEFF',
      },
      {
        label: 'Mapping des profils',
        subtitle: 'Associer rôles et schémas',
        path: '/admin/settings/profile-mapping',
        icon: 'link',
        color: '#0891B2',
        bg: '#ECFEFF',
      },
      {
        label: 'Rôles',
        subtitle: 'Libellés et couleurs',
        path: '/admin/settings/roles',
        icon: 'tag',
        color: '#E11D48',
        bg: '#FFF1F2',
      },
    ],
  },
  {
    title: 'Accès',
    items: [
      {
        label: 'Permissions des pages',
        subtitle: 'Qui accède à quoi',
        path: '/admin/settings/page-permissions',
        icon: 'lock',
        color: '#475569',
        bg: '#F1F5F9',
      },
    ],
  },
  {
    title: 'Finance',
    items: [
      {
        label: 'Comptes bancaires',
        subtitle: 'RIB et coordonnées bancaires',
        path: '/admin/settings/bank-accounts',
        icon: 'bank',
        color: '#16A34A',
        bg: '#F0FDF4',
      },
    ],
  },
];

function ItemIcon({ icon, color }: { icon: string; color: string }) {
  const s = { width: 20, height: 20 };
  const p = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  if (icon === 'calendar') return (
    <Svg {...s} viewBox="0 0 24 24"><Path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" {...p} /></Svg>
  );
  if (icon === 'ticket') return (
    <Svg {...s} viewBox="0 0 24 24"><Path d="M2 9a2 2 0 012-2h16a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2a2 2 0 000-4V9z" {...p} /></Svg>
  );
  if (icon === 'qr') return (
    <Svg {...s} viewBox="0 0 24 24"><Path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h-3zM21 18v3h-3M21 15h-3v-3M15 21v-3" {...p} /></Svg>
  );
  if (icon === 'user') return (
    <Svg {...s} viewBox="0 0 24 24"><Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" {...p} /><Circle cx={12} cy={7} r={4} {...p} /></Svg>
  );
  if (icon === 'sliders') return (
    <Svg {...s} viewBox="0 0 24 24"><Path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" {...p} /></Svg>
  );
  if (icon === 'link') return (
    <Svg {...s} viewBox="0 0 24 24"><Path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" {...p} /><Path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" {...p} /></Svg>
  );
  if (icon === 'tag') return (
    <Svg {...s} viewBox="0 0 24 24"><Path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" {...p} /><Circle cx={7} cy={7} r={1.5} fill={color} stroke="none" /></Svg>
  );
  if (icon === 'lock') return (
    <Svg {...s} viewBox="0 0 24 24"><Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4" {...p} /></Svg>
  );
  if (icon === 'bank') return (
    <Svg {...s} viewBox="0 0 24 24"><Path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10" {...p} /></Svg>
  );
  return null;
}

function ExternalIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke={Colors.textLight} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 3h6v6M10 14L21 3" stroke={Colors.textLight} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedDancer } = useDancer();

  const openSetting = (path: string) => {
    const url = WEB_BASE + path;
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('Erreur', 'Impossible d\'ouvrir le navigateur.');
      }
    });
  };

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
          <Text style={styles.headerTitle}>Paramètres</Text>
        </TouchableOpacity>
        <Text style={styles.headerSub}>Les paramètres s'ouvrent dans le navigateur</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map(section => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.items.map((item, i) => (
                <View key={item.path}>
                  {i > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => openSetting(item.path)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconBg, { backgroundColor: item.bg }]}>
                      <ItemIcon icon={item.icon} color={item.color} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                      <Text style={styles.rowSub}>{item.subtitle}</Text>
                    </View>
                    <ExternalIcon />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.hint}>
          Connectez-vous avec votre compte admin sur l'application web pour modifier ces paramètres.
        </Text>
      </ScrollView>

      <BottomTabBar
        dancerId={selectedDancer?.id ?? ''}
        qrValue={selectedDancer?.id ?? ''}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 52, overflow: 'hidden' },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  backChevron: { color: '#fff', fontSize: 26, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },

  content: { paddingHorizontal: 16, paddingTop: 16 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginTop: 16, paddingHorizontal: 4,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  iconBg: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginLeft: 66 },

  hint: {
    fontSize: 12, color: Colors.textLight, textAlign: 'center',
    marginTop: 24, paddingHorizontal: 24, lineHeight: 18,
  },
});
