// Doit rester le tout premier import : surcharge react-native.Text avant que
// quoi que ce soit ne soit rendu (voir le commentaire du fichier).
import '@/lib/androidFontFix';
import { useEffect } from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DancerProvider } from '@/contexts/DancerContext';
import { PagePermissionsProvider } from '@/contexts/PagePermissionsContext';
import { Colors } from '@/constants/Colors';
import { registerForPushNotificationsAsync } from '@/lib/pushNotifications';
import { isProdEnvironment, firebaseConfig } from '@/lib/firebase';

// Repère visuel permanent tant qu'on n'est pas connecté aux vraies données
// (clubvoiron-prod) — pour ne jamais confondre la version test et la vraie
// app, même si les deux sont installées côte à côte sur le même téléphone.
// Affiche le projectId en clair (pas juste "DEV") : ça a servi à diagnostiquer
// un cas où l'app "CDCV Dev" basculait sur les données de prod apres une
// mise a jour OTA — avec juste "DEV" on ne pouvait pas confirmer a l'oeil
// quel projet Firebase etait reellement charge.
function DevBadge() {
  const insets = useSafeAreaInsets();
  if (isProdEnvironment) return null;
  return (
    <View style={[styles.devBadge, { top: insets.top + 6 }]} pointerEvents="none">
      <Text style={styles.devBadgeText}>DEV · {firebaseConfig.projectId}</Text>
    </View>
  );
}

SplashScreen.preventAutoHideAsync().catch(() => {});

function Gate() {
  const { user, account, dancers, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (user) registerForPushNotificationsAsync(user.uid);
  }, [user]);

  // Verrou permanent (pas juste au login) : un danseur peut être marqué
  // "profil à compléter" pendant que l'app est déjà ouverte (cotisation
  // payée par un tiers sans droits d'édition) — grâce aux écouteurs
  // Firestore temps réel de AuthContext, ce check se redéclenche à chaque
  // changement, pas seulement à la connexion.
  const needsProfileCompletion = dancers.some(d => d.profileCompletionRequired);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    const onForcePasswordChange = segments[0] === 'force-password-change';
    const onCompleteProfile = segments[0] === 'complete-profile';

    if (user && inAuth) {
      router.replace('/');
    } else if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && account?.mustChangePassword && !onForcePasswordChange) {
      router.replace('/force-password-change');
    } else if (user && needsProfileCompletion && !onForcePasswordChange && !onCompleteProfile) {
      router.replace('/complete-profile');
    }
  }, [user, account, needsProfileCompletion, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={{ marginTop: 16, color: Colors.textSecondary, fontSize: 14 }}>Connexion…</Text>
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <DancerProvider>
        <PagePermissionsProvider>
          <StatusBar style="dark" />
          <Gate />
          <DevBadge />
        </PagePermissionsProvider>
      </DancerProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  devBadge: {
    position: 'absolute',
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#EF4444',
    zIndex: 9999,
    elevation: 9999,
  },
  devBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
