import { Stack } from 'expo-router';

export default function DancerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="videos" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="audios" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="planning" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="card" options={{ animation: 'slide_from_bottom', presentation: 'transparentModal' }} />
      <Stack.Screen name="week" options={{ animation: 'slide_from_bottom', presentation: 'transparentModal' }} />
      <Stack.Screen name="session-detail" options={{ animation: 'slide_from_bottom', presentation: 'transparentModal' }} />
      <Stack.Screen name="trombinoscope" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="my-documents" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="library" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="membership" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="membership-create" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="infos" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="chat" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="kiosk" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="instructor" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
