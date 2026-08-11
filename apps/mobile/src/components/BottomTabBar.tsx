import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '@/constants/Colors';
import { usePagePermissions } from '@/contexts/PagePermissionsContext';

type TabKey = 'home' | 'chat' | 'planning' | 'card' | 'videos' | 'audios';

function HomeIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M3 10.5L12 3l9 7.5M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function ChatIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function CalendarIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function VideoIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 8h10a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4a2 2 0 012-2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function QrIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M6.75 6.75h.75v.75h-.75zM6.75 16.5h.75v.75h-.75zM16.5 6.75h.75v.75h-.75zM13.5 13.5h.75v.75h-.75zM13.5 19.5h.75v.75h-.75zM19.5 13.5h.75v.75h-.75zM19.5 19.5h.75v.75h-.75zM16.5 16.5h.75v.75h-.75z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function AudioIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function BottomTabBar({
  dancerId, active, bottomInset,
}: {
  dancerId: string;
  qrValue?: string;
  active?: TabKey;
  bottomInset: number;
}) {
  const router = useRouter();
  const { hasPerm } = usePagePermissions();

  const showChat = hasPerm('/chat');
  const showPlanning = hasPerm('/planning');
  const showCard = hasPerm('/dancer/card');
  const showVideos = hasPerm('/media');
  const showAudios = hasPerm('/audio');

  const go = (screen: TabKey) => {
    if (active === screen) return;
    if (screen === 'home') { router.replace(`/dancer/${dancerId}` as any); return; }
    const href = `/dancer/${dancerId}/${screen}` as any;
    if (screen === 'card') { router.push(href); return; }
    if (active) router.replace(href);
    else router.push(href);
  };
  const colorFor = (key: TabKey) => (active === key ? Colors.tabIconActive : Colors.tabIcon);

  return (
    <View style={[styles.tabBar, { paddingBottom: bottomInset + 8 }]}>
      <TouchableOpacity style={styles.tabItem} onPress={() => go('home')}>
        <HomeIcon color={colorFor('home')} />
        <Text style={[styles.tabLabel, active === 'home' && styles.tabLabelActive]}>Accueil</Text>
      </TouchableOpacity>

      {showChat && (
        <TouchableOpacity style={styles.tabItem} onPress={() => go('chat')}>
          <ChatIcon color={colorFor('chat')} />
          <Text style={[styles.tabLabel, active === 'chat' && styles.tabLabelActive]}>Discussion</Text>
        </TouchableOpacity>
      )}

      {showPlanning && (
        <TouchableOpacity style={styles.tabItem} onPress={() => go('planning')}>
          <CalendarIcon color={colorFor('planning')} />
          <Text style={[styles.tabLabel, active === 'planning' && styles.tabLabelActive]}>Calendrier</Text>
        </TouchableOpacity>
      )}

      {showCard && (
        <TouchableOpacity style={styles.tabItem} onPress={() => go('card')}>
          <QrIcon color={colorFor('card')} />
          <Text style={[styles.tabLabel, active === 'card' && styles.tabLabelActive]}>Ma carte</Text>
        </TouchableOpacity>
      )}

      {showVideos && (
        <TouchableOpacity style={styles.tabItem} onPress={() => go('videos')}>
          <VideoIcon color={colorFor('videos')} />
          <Text style={[styles.tabLabel, active === 'videos' && styles.tabLabelActive]}>Vidéos</Text>
        </TouchableOpacity>
      )}

      {showAudios && (
        <TouchableOpacity style={styles.tabItem} onPress={() => go('audios')}>
          <AudioIcon color={colorFor('audios')} />
          <Text style={[styles.tabLabel, active === 'audios' && styles.tabLabelActive]}>Audios</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.tabBg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingHorizontal: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingBottom: 4, gap: 3 },
  tabLabel: { fontSize: 11, color: Colors.tabIcon, fontWeight: '500' },
  tabLabelActive: { color: Colors.tabIconActive },
});
