import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { router } from 'expo-router';

export default function MyPageScreen() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUser(session.user);
    });
  }, []);

  const handleLogout = async () => {
    Alert.alert('로그아웃', '로그아웃 할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      {/* 프로필 */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.uid}>ID: {user?.id?.slice(0,8)}...</Text>
      </View>

      {/* 메뉴 */}
      <View style={styles.menuSection}>
        <TouchableOpacity style={styles.menuRow} onPress={handleLogout}>
          <Text style={styles.menuText}>로그아웃</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>v0.1.0-beta</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0a0a0a',
    paddingTop: 56, paddingHorizontal: 20,
  },
  profileCard: {
    alignItems: 'center', gap: 8,
    paddingVertical: 32,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#181818',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#2a2a2a',
  },
  avatarText: { color: '#f0ece6', fontSize: 28, fontWeight: '700' },
  email: { color: '#f0ece6', fontSize: 16, fontWeight: '600' },
  uid: { color: '#444', fontSize: 12 },
  menuSection: {
    backgroundColor: '#141414', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e1e1e',
    overflow: 'hidden', marginTop: 16,
  },
  menuRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16,
  },
  menuText: { color: '#ff6b6b', fontSize: 15 },
  menuArrow: { color: '#444', fontSize: 16 },
  version: {
    color: '#333', fontSize: 12,
    textAlign: 'center', marginTop: 'auto', paddingBottom: 20,
  },
});