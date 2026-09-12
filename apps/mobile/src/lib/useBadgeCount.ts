import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { db } from './firebase';

const LAST_VISITED_STORAGE_KEY = 'badge_last_visited_at';

export function useBadgeCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let unsubChat: (() => void) | undefined;
    let unsubAnnouncements: (() => void) | undefined;

    const setup = async () => {
      try {
        const lastVisitedStr = await AsyncStorage.getItem(LAST_VISITED_STORAGE_KEY);
        const lastVisited = lastVisitedStr ? new Date(lastVisitedStr) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const lastVisitedTimestamp = Timestamp.fromDate(lastVisited);

        let chatCount = 0;
        let announcementCount = 0;

        const updateBadge = (newChatCount: number, newAnnouncementCount: number) => {
          chatCount = newChatCount;
          announcementCount = newAnnouncementCount;
          const total = chatCount + announcementCount;
          setUnreadCount(total);
          Notifications.setBadgeCountAsync(total).catch(e => console.error('[useBadgeCount] Badge error:', e));
        };

        // Listen to chat messages
        unsubChat = onSnapshot(
          query(collection(db, 'chatMessages'), where('sentAt', '>', lastVisitedTimestamp)),
          (chatSnap) => updateBadge(chatSnap.size, announcementCount),
          (error) => console.error('[useBadgeCount] Chat listener error:', error),
        );

        // Listen to announcements
        unsubAnnouncements = onSnapshot(
          query(collection(db, 'announcements'), where('sentAt', '>', lastVisitedTimestamp)),
          (announcementsSnap) => updateBadge(chatCount, announcementsSnap.size),
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
  }, []);

  const markAsRead = async () => {
    try {
      await AsyncStorage.setItem(LAST_VISITED_STORAGE_KEY, new Date().toISOString());
      setUnreadCount(0);
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      console.error('[useBadgeCount] Error marking as read:', error);
    }
  };

  return { unreadCount, markAsRead };
}
