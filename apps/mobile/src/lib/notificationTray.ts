import * as Notifications from 'expo-notifications';

// Sur Android, la pastille de l'icône est calculée par le lanceur (Samsung,
// Pixel…) à partir des notifications encore présentes dans le tiroir :
// setBadgeCountAsync ne suffit pas à l'effacer. Depuis que les notifications
// Android arrivent (clé FCM du 26/11), elles restaient dans le tiroir après
// lecture des messages, et la pastille ne partait plus. On retire donc du
// tiroir les notifications des conversations lues.
// Données d'une notification affichée. Sur iOS elles sont dans content.data ;
// sur Android, pour une notification venue du serveur (Expo → FCM), elles
// peuvent n'exister que dans trigger.remoteMessage.data, sous forme de texte
// JSON dans « body » (format d'envoi d'Expo). On regarde partout, sinon le
// filtre ne reconnaissait aucune notification Android et rien n'était retiré.
function presentedData(n: Notifications.Notification): Record<string, unknown> {
  const parse = (v: unknown): Record<string, unknown> | null => {
    if (v && typeof v === 'object') return v as Record<string, unknown>;
    if (typeof v === 'string') {
      try {
        const o = JSON.parse(v);
        return o && typeof o === 'object' ? o : null;
      } catch {
        return null;
      }
    }
    return null;
  };
  const content = parse(n.request.content.data) ?? {};
  if (content.type) return content;
  const remote = (n.request.trigger as any)?.remoteMessage?.data;
  const fromBody = parse(remote?.body) ?? parse(content.body);
  if (fromBody?.type) return fromBody;
  return parse(remote) ?? content;
}

export async function dismissPresentedWhere(
  match: (data: Record<string, unknown>) => boolean,
): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter(n => match(presentedData(n)))
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
