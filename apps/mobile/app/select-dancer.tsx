import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

export default function SelectDancerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { dancers, account } = useAuth();
  const { selectDancer } = useDancer();

  const handleSelect = (id: string) => {
    selectDancer(id);
    router.replace(`/dancer/${id}`);
  };

  const palette = ['#3B82F6', '#8B5CF6', '#EC4899', '#22C55E', '#F97316'];
  const colorFor = (d: { firstName: string; lastName: string }) =>
    palette[(d.firstName.charCodeAt(0) + d.lastName.charCodeAt(0)) % palette.length]!;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
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

        <Text style={styles.headerTitle}>Qui danse ?</Text>
        <Text style={styles.headerSub}>
          {account?.email ?? 'Sélectionne ton profil'}
        </Text>
      </View>

      {/* Grille danseurs */}
      <ScrollView
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {dancers.map(d => {
          const initials = `${d.firstName[0] ?? ''}${d.lastName[0] ?? ''}`.toUpperCase();
          const color = colorFor(d);
          return (
            <TouchableOpacity
              key={d.id}
              style={styles.card}
              onPress={() => handleSelect(d.id)}
              activeOpacity={0.82}
            >
              <View style={[styles.avatar, { backgroundColor: color }]}>
                {d.photoUrl ? (
                  <Image source={{ uri: d.photoUrl }} style={styles.photo} />
                ) : (
                  <Text style={styles.initials}>{initials}</Text>
                )}
              </View>
              <Text style={styles.name} numberOfLines={1}>{d.firstName}</Text>
              <Text style={styles.lastName} numberOfLines={1}>{d.lastName}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Déconnexion */}
      <TouchableOpacity
        style={[styles.logout, { paddingBottom: insets.bottom + 16 }]}
        onPress={() => signOut(auth)}
        activeOpacity={0.6}
      >
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: 24,
    paddingBottom: 56,
    overflow: 'hidden',
  },
  headerWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  headerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 14,
  },
  card: {
    width: '47%',
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  initials: { color: '#fff', fontWeight: '700', fontSize: 26 },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  lastName: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },

  logout: {
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  logoutText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
