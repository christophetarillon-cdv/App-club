import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { Colors } from '@/constants/Colors';

type TabKey = 'chat' | 'planning' | 'card' | 'videos' | 'audios';

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
  const go = (screen: TabKey) => {
    const href = `/dancer/${dancerId}/${screen}` as any;
    if (active === screen) return;
    if (screen === 'card') { router.push(href); return; } // modal → toujours push pour que back() fonctionne
    if (active) router.replace(href);
    else router.push(href);
  };
  const colorFor = (key: TabKey) => (active === key ? Colors.tabIconActive : Colors.tabIcon);

  return (
    <View style={[styles.tabBar, { paddingBottom: bottomInset + 8 }]}>
      <TouchableOpacity style={styles.tabItem} onPress={() => go('chat')}>
        <ChatIcon color={colorFor('chat')} />
        <Text style={[styles.tabLabel, active === 'chat' && styles.tabLabelActive]}>Discussion</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tabItem} onPress={() => go('planning')}>
        <CalendarIcon color={colorFor('planning')} />
        <Text style={[styles.tabLabel, active === 'planning' && styles.tabLabelActive]}>Calendrier</Text>
      </TouchableOpacity>

      <View style={styles.tabCenter}>
        <TouchableOpacity style={styles.tabCenterBtn} onPress={() => go('card')} activeOpacity={0.85}>
          <Svg width={34} height={34} viewBox="0 0 24 24" fill="none">
            <Rect x="3" y="3" width="7" height="7" rx="1" stroke="white" strokeWidth={1.8} />
            <Rect x="14" y="3" width="7" height="7" rx="1" stroke="white" strokeWidth={1.8} />
            <Rect x="3" y="14" width="7" height="7" rx="1" stroke="white" strokeWidth={1.8} />
            <Rect x="5" y="5" width="3" height="3" fill="white" />
            <Rect x="16" y="5" width="3" height="3" fill="white" />
            <Rect x="5" y="16" width="3" height="3" fill="white" />
            <Path d="M14 14h2v2h-2zM18 14h3v2h-3zM14 18h2v3h-2zM18 18h3v3h-3z" fill="white" />
          </Svg>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.tabItem} onPress={() => go('videos')}>
        <VideoIcon color={colorFor('videos')} />
        <Text style={[styles.tabLabel, active === 'videos' && styles.tabLabelActive]}>Vidéos</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tabItem} onPress={() => go('audios')}>
        <AudioIcon color={colorFor('audios')} />
        <Text style={[styles.tabLabel, active === 'audios' && styles.tabLabelActive]}>Audios</Text>
      </TouchableOpacity>
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
  tabCenter: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 },
  tabCenterBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});
