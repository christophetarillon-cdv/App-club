import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { db } from './firebase';

const LAST_VISITED_STORAGE_KEY = 'badge_last_visited_at';

export function useBadgeCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  // Calculate unread count on mount and whenever needed
  const updateBadgeCount = async () => {
    try {
      // Get last visited timestamp
      const lastVisitedStr = await AsyncStorage.getItem(LAST_VISITED_STORAGE_KEY);
      const lastVisited = lastVisitedStr ? new Date(lastVisitedStr) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 days ago

      const lastVisitedTimestamp = Timestamp.fromDate(lastVisited);

      // Count unread chat messages
      const chatQuery = query(
        collection(db, 'chatMessages'),
        where('sentAt', '>', lastVisitedTimestamp),
      );
      const chatSnap = await getDocs(chatQuery);
      const chatCount = chatSnap.size;

      // Count unread announcements
      const announcementsQuery = query(
        collection(db, 'announcements'),
        where('sentAt', '>', lastVisitedTimestamp),
      );
      const announcementsSnap = await getDocs(announcementsQuery);
      const announcementCount = announcementsSnap.size;

      const total = chatCount + announcementCount;
      setUnreadCount(total);

      // Set app badge
      await Notifications.setBadgeCountAsync(total);
    } catch (error) {
      console.error('[useBadgeCount] Error:', error);
    }
  };

  // Update badge on mount
  useEffect(() => {
    updateBadgeCount();
  }, []);

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

  return { unreadCount, markAsRead, updateBadgeCount };
}
