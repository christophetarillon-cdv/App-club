import { useEffect } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DancerProvider } from '@/contexts/DancerContext';
import { PagePermissionsProvider } from '@/contexts/PagePermissionsContext';
import { Colors } from '@/constants/Colors';
import { registerForPushNotificationsAsync } from '@/lib/pushNotifications';

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
        </PagePermissionsProvider>
      </DancerProvider>
    </AuthProvider>
  );
}
