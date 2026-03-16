import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, Switch, Platform
} from 'react-native';
import { supabase } from '../../lib/supabase';
import {
  requestNotificationPermission,
  scheduleReminder,
  cancelReminder,
} from '../../lib/notifications';

export default function MyPageScreen() {
  const [user, setUser] = useState(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderHour, setReminderHour] = useState(21);
  const [reminderMinute, setReminderMinute] = useState(0);

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
        onPress: async () => { await supabase.auth.signOut(); }
      }
    ]);
  };

  const handleReminderToggle = async (value) => {
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('알림 권한 필요', '설정에서 알림 권한을 허용해주세요');
        return;
      }
      await scheduleReminder(reminderHour, reminderMinute);
      Alert.alert('리마인더 설정', `매일 ${reminderHour}:${String(reminderMinute).padStart(2,'0')}에 알림을 보낼게요`);
    } else {
      await cancelReminder();
    }
    setReminderOn(value);
  };

  const adjustHour = (delta) => {
    const newHour = (reminderHour + delta + 24) % 24;
    setReminderHour(newHour);
    if (reminderOn) scheduleReminder(newHour, reminderMinute);
  };

  const adjustMinute = (delta) => {
    const newMinute = (reminderMinute + delta + 60) % 60;
    setReminderMinute(newMinute);
    if (reminderOn) scheduleReminder(reminderHour, newMinute);
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
        <Text style={styles.uid}>ID: {user?.id?.slice(0, 8)}...</Text>
      </View>

      {/* 알림 설정 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>알림</Text>
        <View style={styles.menuSection}>
          <View style={styles.menuRow}>
            <Text style={styles.menuText}>매일 리마인더</Text>
            <Switch
              value={reminderOn}
              onValueChange={handleReminderToggle}
              trackColor={{ false: '#2a2a2a', true: '#f0ece6' }}
              thumbColor={reminderOn ? '#0a0a0a' : '#666'}
            />
          </View>

          {/* 시간 설정 */}
          {reminderOn && (
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>알림 시간</Text>
              <View style={styles.timePicker}>
                <View style={styles.timeUnit}>
                  <TouchableOpacity onPress={() => adjustHour(1)} style={styles.timeBtn}>
                    <Text style={styles.timeBtnText}>▲</Text>
                  </TouchableOpacity>
                  <Text style={styles.timeValue}>{String(reminderHour).padStart(2, '0')}</Text>
                  <TouchableOpacity onPress={() => adjustHour(-1)} style={styles.timeBtn}>
                    <Text style={styles.timeBtnText}>▼</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.timeSep}>:</Text>
                <View style={styles.timeUnit}>
                  <TouchableOpacity onPress={() => adjustMinute(5)} style={styles.timeBtn}>
                    <Text style={styles.timeBtnText}>▲</Text>
                  </TouchableOpacity>
                  <Text style={styles.timeValue}>{String(reminderMinute).padStart(2, '0')}</Text>
                  <TouchableOpacity onPress={() => adjustMinute(-5)} style={styles.timeBtn}>
                    <Text style={styles.timeBtnText}>▼</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* 계정 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>계정</Text>
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuRow} onPress={handleLogout}>
            <Text style={[styles.menuText, { color: '#ff6b6b' }]}>로그아웃</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>
        </View>
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
    alignItems: 'center', gap: 8, paddingVertical: 28,
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

  section: { marginBottom: 20 },
  sectionTitle: { color: '#555', fontSize: 12, marginBottom: 8, marginLeft: 4 },
  menuSection: {
    backgroundColor: '#141414', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e1e1e', overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e1e1e',
  },
  menuText: { color: '#f0ece6', fontSize: 15 },
  menuArrow: { color: '#444', fontSize: 16 },

  // 시간 피커
  timeRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16,
  },
  timeLabel: { color: '#888', fontSize: 14 },
  timePicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeUnit: { alignItems: 'center', gap: 4 },
  timeBtn: { padding: 6 },
  timeBtnText: { color: '#888', fontSize: 12 },
  timeValue: { color: '#f0ece6', fontSize: 22, fontWeight: '700', minWidth: 36, textAlign: 'center' },
  timeSep: { color: '#f0ece6', fontSize: 22, fontWeight: '700', marginBottom: 4 },

  version: {
    color: '#333', fontSize: 12,
    textAlign: 'center', marginTop: 'auto', paddingBottom: 20,
  },
});