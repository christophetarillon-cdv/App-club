import * as Notifications from 'expo-notifications';

// Sur Android, la pastille de l'icône est calculée par le lanceur (Samsung,
// Pixel…) à partir des notifications encore présentes dans le tiroir :
// setBadgeCountAsync ne suffit pas à l'effacer. Depuis que les notifications
// Android arrivent (clé FCM du 26/11), elles restaient dans le tiroir après
// lecture des messages, et la pastille ne partait plus. On retire donc du
// tiroir les notifications des conversations lues.
export async function dismissPresentedWhere(
  match: (data: Record<string, unknown>) => boolean,
): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter(n => match((n.request.content.data ?? {}) as Record<string, unknown>))
        .map(n => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch (err) {
    console.warn('[notificationTray] dismiss failed:', err);
  }
}

export async function dismissAllPresented(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (err) {
    console.warn('[notificationTray] dismissAll failed:', err);
  }
}
