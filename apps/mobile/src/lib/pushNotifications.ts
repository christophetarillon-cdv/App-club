import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

// Demande la permission et enregistre le token push de l'appareil sur le
// compte connecté (accounts/{uid}.fcmTokens), utilisé par la Cloud Function
// sendNotification pour l'envoi. Ne fait rien en cas d'échec (ex: Expo Go,
// permission refusée) — l'utilisateur reçoit simplement moins de notifications.
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

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (!token) return;

    await updateDoc(doc(db, 'accounts', uid), { fcmTokens: arrayUnion(token) });
  } catch (err) {
    console.error('registerForPushNotificationsAsync failed:', err);
  }
}
