import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

// Demande la permission et enregistre le token push Expo de l'appareil sur
// le compte connecté (accounts/{uid}.fcmTokens), utilisé par la Cloud
// Function sendNotification (via le service Push d'Expo, qui gère la
// livraison réelle vers APNs/FCM). On utilise le token Expo plutôt que le
// token natif brut : le token natif iOS (APNs) n'est pas un token FCM valide
// et admin.messaging() le rejette directement.
export async function registerForPushNotificationsAsync(uid: string) {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    await updateDoc(doc(db, 'accounts', uid), { fcmTokens: arrayUnion(token) });
  } catch (err) {
    console.error('registerForPushNotificationsAsync failed:', err);
  }
}
