import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#1a1a1a' },
        tabBarActiveTintColor: '#f0ece6',
        tabBarInactiveTintColor: '#444',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: '홈', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⬛</Text> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: '검색', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🔍</Text> }}
      />
      <Tabs.Screen
        name="team"
        options={{ title: '팀', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>👥</Text> }}
      />
      <Tabs.Screen
        name="mypage"
        options={{ title: '마이페이지', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>👤</Text> }}
      />
    </Tabs>
  );
}