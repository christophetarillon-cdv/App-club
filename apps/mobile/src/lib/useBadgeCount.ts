import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { db } from './firebase';

const LAST_VISITED_KEY_PREFIX = 'badge_last_visited_';

export function useBadgeCount(dancerId?: string) {
  const [chatCount, setChatCount] = useState(0);
  const [announcementCount, setAnnouncementCount] = useState(0);

  // Setup listeners - scoped to dancer if provided
  useEffect(() => {
    if (!dancerId) return;

    let unsubChat: (() => void) | undefined;
    let unsubAnnouncements: (() => void) | undefined;

    const setup = async () => {
      try {
        const storageKey = `${LAST_VISITED_KEY_PREFIX}${dancerId}`;
        const lastVisitedStr = await AsyncStorage.getItem(storageKey);
        const lastVisited = lastVisitedStr
          ? new Date(lastVisitedStr)
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const lastVisitedTimestamp = Timestamp.fromDate(lastVisited);

        unsubChat = onSnapshot(
          query(collection(db, 'chatMessages'), where('sentAt', '>', lastVisitedTimestamp)),
          (chatSnap) => setChatCount(chatSnap.size),
          (error) => console.error('[useBadgeCount] Chat listener error:', error),
        );

        unsubAnnouncements = onSnapshot(
          query(collection(db, 'announcements'), where('sentAt', '>', lastVisitedTimestamp)),
          (announcementsSnap) => setAnnouncementCount(announcementsSnap.size),
          (error) => console.error('[useBadgeCount] Announcements listener error:', error),
        );
      } catch (error) {
        console.error('[useBadgeCount] Setup error:', error);
      }
    };

    setup();

    return () => {
      unsubChat?.();
      unsubAnnouncements?.();
    };
  }, [dancerId]);

  // Update badge when either count changes
  useEffect(() => {
    const total = chatCount + announcementCount;
    Notifications.setBadgeCountAsync(total).catch(e =>
      console.error('[useBadgeCount] Badge error:', e)
    );
  }, [chatCount, announcementCount]);

  const unreadCount = chatCount + announcementCount;

  const markAsRead = async () => {
    if (!dancerId) return;
    try {
      const storageKey = `${LAST_VISITED_KEY_PREFIX}${dancerId}`;
      await AsyncStorage.setItem(storageKey, new Date().toISOString());
      setChatCount(0);
      setAnnouncementCount(0);
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      console.error('[useBadgeCount] Error marking as read:', error);
    }
  };

  return { unreadCount, markAsRead };
}
