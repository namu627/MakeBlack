import { Tabs } from 'expo-router';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { THEMES } from '../../constants/theme';

// 탭바는 다크 테마 고정 (index.js 등 각 화면이 테마 토큰 관리)
const C = THEMES.dark;

function TabIcon({ icon, label, focused }) {
  return (
    <View style={styles.iconWrap}>
      <Text style={[styles.icon, { color: focused ? C.text : '#333' }]}>{icon}</Text>
      <Text style={[styles.label, { color: focused ? C.text : '#333' }]}>{label}</Text>
      {focused && <View style={styles.dot} />}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⌂" label="홈" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="◈" label="팀" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="◉" label="마이페이지" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: C.bg + 'e0',
    borderTopColor: C.border,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 82 : 68,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
    elevation: 0,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
    paddingTop: 6,
  },
  icon: {
    fontSize: 20,
  },
  label: {
    fontSize: 9,
    letterSpacing: 0.4,
  },
  dot: {
    position: 'absolute',
    bottom: -6,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: THEMES.dark.text,
  },
});
