import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

// Demande la permission et enregistre le token push de l'appareil sur le
// compte connecté (accounts/{uid}.fcmTokens), utilisé par la Cloud Function
// sendNotification pour l'envoi. Ne fait rien en cas d'échec (ex: Expo Go,
// permission refusée) — l'utilisateur reçoit simplement moins de notifications.
//
// DIAGNOSTIC TEMPORAIRE : affiche une alerte visible en cas d'échec, pour
// identifier pourquoi aucun token n'est jamais enregistré — à retirer une
// fois le problème identifié.
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
    if (finalStatus !== 'granted') {
      Alert.alert('Push [diag]', `Permission non accordée (status: ${finalStatus})`);
      return;
    }

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (!token) {
      Alert.alert('Push [diag]', 'Aucun token retourné par getDevicePushTokenAsync');
      return;
    }

    await updateDoc(doc(db, 'accounts', uid), { fcmTokens: arrayUnion(token) });
    Alert.alert('Push [diag]', `Token enregistré : ${token.slice(0, 20)}…`);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('registerForPushNotificationsAsync failed:', err);
    Alert.alert('Push [diag] erreur', msg);
  }
}
