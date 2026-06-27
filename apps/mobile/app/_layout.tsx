import { useEffect } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DancerProvider } from '@/contexts/DancerContext';
import { PagePermissionsProvider } from '@/contexts/PagePermissionsContext';
import { Colors } from '@/constants/Colors';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Gate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (user && inAuth) {
      router.replace('/');
    } else if (!user && !inAuth) {
      router.replace('/(auth)/login');
    }
  }, [user, loading, segments]);

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
