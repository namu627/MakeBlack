import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Switch, ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { dateKey } from '../../lib/colorMath';
import {
  requestNotificationPermission,
  scheduleReminder,
  cancelReminder,
} from '../../lib/notifications';

const C = {
  bg: '#0a0a0a', surface: '#141414', card: '#181818',
  border: '#242424', border2: '#2e2e2e',
  text: '#f0ece6', muted: '#888888', dim: '#555555',
};

export default function MyPageScreen() {
  const [userId, setUserId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);

  // 알림
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderHour, setReminderHour] = useState(21);
  const [reminderMinute, setReminderMinute] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadProfile();
    loadStats();
  }, [userId]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, handle, bio')
        .eq('id', userId)
        .single();
      if (!error && data) setProfile(data);
    } catch (e) {}
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const monthEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('palette_history')
        .select('date, drops, total')
        .eq('user_id', userId)
        .gte('date', monthStart)
        .lte('date', monthEnd);
      if (error) throw error;

      const rows = data ?? [];

      // 통계 계산
      let totalDone = 0;
      let activeDays = 0;
      let blackDays = 0;
      let totalProgress = 0;
      let progressCount = 0;

      rows.forEach(row => {
        const drops = row.drops?.length ?? 0;
        const total = row.total ?? 0;
        if (total > 0) {
          activeDays++;
          totalDone += drops;
          if (drops >= total) blackDays++;
          totalProgress += drops / total;
          progressCount++;
        }
      });

      // 연속 달성 계산 (오늘부터 역순)
      let streak = 0;
      const today = dateKey();
      for (let i = 0; i < 60; i++) {
        const d = new Date(today + 'T00:00:00');
        d.setDate(d.getDate() - i);
        const dk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const row = rows.find(r => r.date === dk);
        if (row && row.total > 0 && (row.drops?.length ?? 0) >= row.total) {
          streak++;
        } else if (i > 0) {
          break;
        }
      }

      const avgProgress = progressCount > 0 ? totalProgress / progressCount : 0;

      setStats({ totalDone, activeDays, blackDays, streak, avgProgress });

      // 히트맵 데이터 (이번 달 전체)
      const cells = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dk = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const row = rows.find(r => r.date === dk);
        const drops = row?.drops?.length ?? 0;
        const total = row?.total ?? 0;
        const progress = total > 0 ? drops / total : 0;
        const isBlack = total > 0 && drops >= total;
        cells.push({ day, dk, progress, isBlack, hasData: total > 0 });
      }
      setHeatmap(cells);
    } catch (e) {
      setStats({ totalDone: 0, activeDays: 0, blackDays: 0, streak: 0, avgProgress: 0 });
    } finally {
      setLoadingStats(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('로그아웃', '로그아웃 할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃', style: 'destructive',
        onPress: async () => { await supabase.auth.signOut(); }
      }
    ]);
  };

  const handleSettings = () => {
    Alert.alert('설정', '준비 중이에요');
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

  const displayName = profile?.name ?? '사용자';
  const displayHandle = profile?.handle ? `@${profile.handle}` : '';
  const avatarLetter = displayName[0]?.toUpperCase() ?? '?';

  const now = new Date();
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  // 히트맵 색상: 진행률에 따라 밝기
  const heatColor = (cell) => {
    if (!cell.hasData) return C.border;
    if (cell.isBlack) return '#1a1a1a'; // 완료 = 검정
    if (cell.progress > 0) {
      const alpha = Math.round(40 + cell.progress * 140);
      return `rgba(240,236,230,${(40 + cell.progress * 140) / 255})`;
    }
    return C.surface;
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* 프로필 헤더 */}
      <View style={styles.profileHeader}>
        <View style={styles.profileTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <TouchableOpacity style={styles.settingsBtn} onPress={handleSettings}>
            <Text style={styles.settingsBtnTxt}>설정</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.profileName}>{displayName}</Text>
        {displayHandle ? <Text style={styles.profileHandle}>{displayHandle}</Text> : null}
        {profile?.bio ? <Text style={styles.profileBio}>{profile.bio}</Text> : null}
      </View>

      {/* 통계 섹션 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>이번 달 통계</Text>
        <Text style={styles.sectionMonth}>{monthLabel}</Text>
      </View>

      {loadingStats ? (
        <View style={styles.statsLoading}>
          <ActivityIndicator color={C.muted} />
        </View>
      ) : (
        <>
          {/* 4개 스탯 카드 */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats?.totalDone ?? 0}</Text>
              <Text style={styles.statLabel}>완료한 할 일</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats?.activeDays ?? 0}</Text>
              <Text style={styles.statLabel}>활동한 날</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats?.blackDays ?? 0}</Text>
              <Text style={styles.statLabel}>BLACK 달성</Text>
            </View>
            <View style={[styles.statCard, stats?.streak > 0 && styles.statCardAccent]}>
              <Text style={[styles.statValue, stats?.streak > 0 && styles.statValueAccent]}>
                {stats?.streak ?? 0}
              </Text>
              <Text style={[styles.statLabel, stats?.streak > 0 && styles.statLabelAccent]}>연속 달성</Text>
            </View>
          </View>

          {/* 평균 완료율 바 */}
          <View style={styles.avgCard}>
            <View style={styles.avgRow}>
              <Text style={styles.avgLabel}>평균 완료율</Text>
              <Text style={styles.avgValue}>{Math.round((stats?.avgProgress ?? 0) * 100)}%</Text>
            </View>
            <View style={styles.avgTrack}>
              <View style={[styles.avgFill, { width: `${Math.round((stats?.avgProgress ?? 0) * 100)}%` }]} />
            </View>
          </View>

          {/* 히트맵 */}
          <View style={styles.heatmapCard}>
            <Text style={styles.heatmapTitle}>{monthLabel} 기록</Text>
            <View style={styles.heatmapGrid}>
              {heatmap.map(cell => (
                <View
                  key={cell.dk}
                  style={[
                    styles.heatmapCell,
                    {
                      backgroundColor: cell.isBlack ? '#0a0a0a'
                        : cell.hasData && cell.progress > 0
                          ? `rgba(240,236,230,${0.12 + cell.progress * 0.55})`
                          : C.surface,
                      borderColor: cell.isBlack
                        ? 'rgba(255,255,255,0.08)'
                        : cell.hasData && cell.progress > 0
                          ? 'rgba(240,236,230,0.12)'
                          : C.border,
                    }
                  ]}
                >
                  <Text style={[
                    styles.heatmapDayNum,
                    cell.isBlack && { color: '#2a2a2a' },
                    cell.hasData && cell.progress > 0 && !cell.isBlack && { color: C.muted },
                  ]}>
                    {cell.day}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {/* 알림 설정 */}
      <Text style={styles.sectionLabel2}>알림</Text>
      <View style={styles.menuSection}>
        <View style={styles.menuRow}>
          <Text style={styles.menuText}>매일 리마인더</Text>
          <Switch
            value={reminderOn}
            onValueChange={handleReminderToggle}
            trackColor={{ false: '#2a2a2a', true: C.text }}
            thumbColor={reminderOn ? '#0a0a0a' : '#666'}
          />
        </View>
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

      {/* 로그아웃 */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutTxt}>로그아웃</Text>
      </TouchableOpacity>

      <Text style={styles.version}>v0.1.0-beta</Text>
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 56 },

  // 프로필
  profileHeader: { paddingHorizontal: 20, paddingBottom: 24 },
  profileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  avatar: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: C.card,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: C.border2,
  },
  avatarText: { color: C.text, fontSize: 26, fontWeight: '700' },
  settingsBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: C.surface, borderRadius: 999,
    borderWidth: 1, borderColor: C.border,
  },
  settingsBtnTxt: { color: C.muted, fontSize: 12 },
  profileName: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 2 },
  profileHandle: { color: C.muted, fontSize: 13, marginBottom: 4 },
  profileBio: { color: C.dim, fontSize: 13, lineHeight: 20 },

  // 섹션 헤더
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionLabel: { color: C.dim, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  sectionMonth: { color: C.dim, fontSize: 11 },
  sectionLabel2: { color: C.dim, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 8, marginTop: 8 },

  statsLoading: { height: 120, justifyContent: 'center', alignItems: 'center' },

  // 스탯 그리드
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  statCard: {
    flex: 1, minWidth: '44%',
    backgroundColor: C.surface, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: C.border, gap: 4,
  },
  statCardAccent: { borderColor: 'rgba(240,236,230,0.2)', backgroundColor: '#111' },
  statValue: { color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  statValueAccent: { color: C.text },
  statLabel: { color: C.muted, fontSize: 11 },
  statLabelAccent: { color: C.muted },

  // 평균 완료율
  avgCard: { marginHorizontal: 20, marginBottom: 10, backgroundColor: C.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.border },
  avgRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  avgLabel: { color: C.muted, fontSize: 12 },
  avgValue: { color: C.text, fontSize: 13, fontWeight: '700' },
  avgTrack: { height: 5, borderRadius: 3, backgroundColor: C.card, overflow: 'hidden' },
  avgFill: { height: '100%', borderRadius: 3, backgroundColor: C.text },

  // 히트맵
  heatmapCard: { marginHorizontal: 20, marginBottom: 20, backgroundColor: C.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.border },
  heatmapTitle: { color: C.muted, fontSize: 11, marginBottom: 12 },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  heatmapCell: {
    width: 34, height: 34, borderRadius: 7,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  heatmapDayNum: { fontSize: 9, color: C.dim },

  // 알림
  menuSection: {
    marginHorizontal: 20, backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 16,
  },
  menuRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  menuText: { color: C.text, fontSize: 15 },
  timeRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16,
  },
  timeLabel: { color: C.muted, fontSize: 14 },
  timePicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeUnit: { alignItems: 'center', gap: 4 },
  timeBtn: { padding: 6 },
  timeBtnText: { color: C.muted, fontSize: 12 },
  timeValue: { color: C.text, fontSize: 22, fontWeight: '700', minWidth: 36, textAlign: 'center' },
  timeSep: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },

  // 로그아웃
  logoutBtn: {
    marginHorizontal: 20, paddingVertical: 15,
    borderRadius: 12, borderWidth: 1, borderColor: '#2a1a1a',
    alignItems: 'center', backgroundColor: '#120a0a', marginBottom: 12,
  },
  logoutTxt: { color: '#ff6b6b', fontSize: 14, fontWeight: '600' },

  version: { color: '#333', fontSize: 12, textAlign: 'center', paddingBottom: 8 },
});
