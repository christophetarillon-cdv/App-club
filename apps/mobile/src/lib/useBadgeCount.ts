import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { db } from './firebase';

const LAST_VISITED_STORAGE_KEY = 'badge_last_visited_at';

export function useBadgeCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  // Listen to chat messages and announcements in real-time
  const setupListeners = useCallback(async () => {
    try {
      const lastVisitedStr = await AsyncStorage.getItem(LAST_VISITED_STORAGE_KEY);
      const lastVisited = lastVisitedStr ? new Date(lastVisitedStr) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const lastVisitedTimestamp = Timestamp.fromDate(lastVisited);

      let chatCount = 0;
      let announcementCount = 0;

      const updateTotal = () => {
        const total = chatCount + announcementCount;
        setUnreadCount(total);
        Notifications.setBadgeCountAsync(total).catch(e => console.error('[useBadgeCount] Badge error:', e));
      };

      // Listen to chat messages
      const chatQuery = query(
        collection(db, 'chatMessages'),
        where('sentAt', '>', lastVisitedTimestamp),
      );

      // Listen to announcements
      const announcementsQuery = query(
        collection(db, 'announcements'),
        where('sentAt', '>', lastVisitedTimestamp),
      );

      const unsubChat = onSnapshot(chatQuery, (chatSnap) => {
        chatCount = chatSnap.size;
        updateTotal();
      });

      const unsubAnnouncements = onSnapshot(announcementsQuery, (announcementsSnap) => {
        announcementCount = announcementsSnap.size;
        updateTotal();
      });

      return () => {
        unsubChat();
        unsubAnnouncements();
      };
    } catch (error) {
      console.error('[useBadgeCount] Error:', error);
      return () => {};
    }
  }, []);

  // Setup listeners on mount
  useEffect(() => {
    let unsubChat: (() => void) | undefined;
    setupListeners().then(unsub => { unsubChat = unsub; });
    return () => unsubChat?.();
  }, [setupListeners]);

  // Mark all as read (call this when user visits chat/announcements)
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
