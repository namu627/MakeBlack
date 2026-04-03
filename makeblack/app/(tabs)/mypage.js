// mypage.js — 마이페이지 화면
// 1단계: state 선언 + useEffect + 데이터 로딩
// 2단계: Toggle + SettingRow + SettingsSheet (설정 바텀시트 + 계정 관리)
// 3단계: 프로필 헤더 + 통계 카드 렌더
// 4단계: 요일별 차트 + 히트맵 렌더
// 5단계: StyleSheet
// ══════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Switch, ActivityIndicator, TextInput, Modal,
  Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { dateKey } from '../../lib/colorMath';
// expo-secure-store 미설치 → AsyncStorage로 PIN 저장 (프로덕션에서는 SecureStore 권장)
// import * as SecureStore from 'expo-secure-store';

// ══════════════════════════════════════════════════════
// 상수
// ══════════════════════════════════════════════════════

const C = {
  bg: '#0a0a0a', surface: '#141414', card: '#181818',
  border: '#242424', border2: '#2e2e2e',
  text: '#f0ece6', muted: '#888888', dim: '#555555',
};

const R = { sm: 10, md: 16, lg: 22, full: 999 };

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토'];

const SETTINGS_KEY = '@makeblack_settings';
const PIN_KEY      = '@makeblack_pin';

const DEFAULT_SETTINGS = {
  paletteSize:          'medium',
  blackAnimationOn:     true,
  teamBlackAnimationOn: true,
  calStartSunday:       true,
  pinLock:              false,
  language:             'ko',
  reminderOn:           false,
  reminderTime:         '21:00',
};

// ══════════════════════════════════════════════════════
// 1단계 ▼ MyPageScreen — state + 데이터 로딩
// ══════════════════════════════════════════════════════

export default function MyPageScreen() {
  const insets = useSafeAreaInsets();

  // ── 인증 ──────────────────────────────────────────
  const [userId, setUserId] = useState(null);

  // ── 프로필 ────────────────────────────────────────
  const [profile, setProfile] = useState(null);

  // ── 통계 ──────────────────────────────────────────
  const [stats, setStats] = useState({
    totalDone:   0,
    activeDays:  0,
    blackDays:   0,
    streak:      0,
    avgProgress: 0,
  });
  const [byDow,   setByDow]   = useState(Array.from({ length: 7 }, (_, dow) => ({ dow, avg: 0, count: 0 })));
  const [heatmap, setHeatmap] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);

  // ── 설정 ──────────────────────────────────────────
  const [settings,     setSettings]     = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  // ── 아바타 업로드 ─────────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── 날짜 파생 값 ──────────────────────────────────
  const now        = new Date();
  const year       = now.getFullYear();
  const month      = now.getMonth();
  const monthLabel = `${year}년 ${month + 1}월`;

  // ══════════════════════════════════════════════════════
  // 초기화
  // ══════════════════════════════════════════════════════

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
    loadSettings();
  }, []);

  // 최초 userId 확정 시 로드
  useEffect(() => {
    if (!userId) return;
    loadProfile();
    loadStats();
  }, [userId]);

  // 탭 포커스될 때마다 재로드 (통계 실시간 반영 — 3, 4번 수정)
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        loadProfile();
        loadStats();
      }
    }, [userId])
  );

  // ── AsyncStorage 설정 로드 ────────────────────────
  const loadSettings = async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings(prev => ({ ...prev, ...JSON.parse(raw) }));
    } catch (e) {}
  };

  const saveSettings = async (next) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (e) {}
  };

  const updSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  // ── 프로필 로드 ───────────────────────────────────
  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, handle, bio, avatar_url')
        .eq('id', userId)
        .single();
      if (!error && data) setProfile(data);
    } catch (e) {}
  };

  // ── 아바타 선택 + Supabase Storage 업로드 ─────────
  const pickAndUploadAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '갤러리 접근 권한이 필요해요');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const base64 = result.assets[0].base64;
      const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      console.log('[avatar] uploading to:', `${userId}/avatar.jpg`);
      console.log('[avatar] byteArray size:', byteArray.length);
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(`${userId}/avatar.jpg`, byteArray, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(`${userId}/avatar.jpg`);

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (updateError) throw updateError;

      await loadProfile();
    } catch (e) {
      console.log('[avatar upload error]', e);
      Alert.alert('업로드 실패', '다시 시도해 주세요');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── 통계 로드 (Supabase palette_history) ──────────
  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthStart  = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const monthEnd    = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('palette_history')
        .select('date, drops, total')
        .eq('user_id', userId)
        .gte('date', monthStart)
        .lte('date', monthEnd);
      if (error) throw error;

      const rows = data ?? [];

      let totalDone   = 0;
      let activeDays  = 0;
      let blackDays   = 0;
      let sumProgress = 0;
      let progCount   = 0;
      const dowSum   = Array(7).fill(0);
      const dowCount = Array(7).fill(0);
      const cells = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const dk    = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const row   = rows.find(r => r.date === dk);
        const done  = row?.drops?.length ?? 0;
        const total = row?.total ?? 0;
        const prog  = total > 0 ? done / total : 0;
        const isBlack = total > 0 && done >= total;

        if (total > 0) {
          activeDays++;
          totalDone   += done;
          sumProgress += prog;
          progCount++;
          if (isBlack) blackDays++;
          const dow = new Date(dk + 'T00:00:00').getDay();
          dowSum[dow]   += prog;
          dowCount[dow] += 1;
        }
        cells.push({ day, dk, prog, isBlack, hasData: total > 0 });
      }

      // streak — 지난달 포함 60일
      const today = dateKey();
      const sDate = new Date(today + 'T00:00:00');
      sDate.setDate(sDate.getDate() - 60);
      const { data: sData } = await supabase
        .from('palette_history')
        .select('date, drops, total')
        .eq('user_id', userId)
        .gte('date', dateKey(sDate))
        .lte('date', today);
      const allRows = sData ?? [];
      let streak = 0;
      for (let i = 0; i < 61; i++) {
        const d = new Date(today + 'T00:00:00');
        d.setDate(d.getDate() - i);
        const dk  = dateKey(d);
        const row = allRows.find(r => r.date === dk);
        if (row && row.total > 0 && (row.drops?.length ?? 0) >= row.total) streak++;
        else if (i > 0) break;
      }

      setStats({ totalDone, activeDays, blackDays, streak, avgProgress: progCount > 0 ? sumProgress / progCount : 0 });
      setByDow(Array.from({ length: 7 }, (_, dow) => ({
        dow,
        avg:   dowCount[dow] > 0 ? dowSum[dow] / dowCount[dow] : 0,
        count: dowCount[dow],
      })));
      setHeatmap(cells);
    } catch (e) {
      setStats({ totalDone: 0, activeDays: 0, blackDays: 0, streak: 0, avgProgress: 0 });
    } finally {
      setLoadingStats(false);
    }
  };

  // ── 프로필 파생 값 ────────────────────────────────
  const displayName   = profile?.name   ?? '사용자';
  // handle이 이미 @로 시작하면 그대로, 아니면 @ 추가 (@@test 버그 방지)
  const displayHandle = profile?.handle
    ? (profile.handle.startsWith('@') ? profile.handle : '@' + profile.handle)
    : '';
  const avatarLetter  = displayName[0]?.toUpperCase() ?? '?';
  const firstDow      = new Date(year, month, 1).getDay();

  // ── 히트맵 rows 계산 ──────────────────────────────
  // 7열 그리드로 그룹화 (앞 빈칸 + 날짜 셀)
  const totalCells = firstDow + heatmap.length;
  const numRows    = Math.ceil(totalCells / 7);
  const heatRows   = Array.from({ length: numRows }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => {
      const idx = r * 7 + c - firstDow;
      return idx >= 0 && idx < heatmap.length ? heatmap[idx] : null;
    })
  );

  const avgPct = Math.round((stats.avgProgress ?? 0) * 100);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 8, backgroundColor: C.bg }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ══════════════════════════════════════════════
          3단계 ▼ 프로필 헤더
      ══════════════════════════════════════════════ */}
      <View style={styles.profileSection}>
        {/* 설정 버튼 */}
        <TouchableOpacity
          onPress={() => setShowSettings(true)}
          style={styles.gearBtn}
          hitSlop={8}
        >
          <Text style={styles.gearBtnTxt}>⚙</Text>
        </TouchableOpacity>

        {/* 아바타 + 이름 */}
        <View style={styles.profileRow}>
          <TouchableOpacity onPress={pickAndUploadAvatar} style={styles.avatar} activeOpacity={0.8}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarTxt}>{avatarLetter}</Text>
            )}
            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <View>
            <Text style={styles.profileName}>{displayName}</Text>
            {displayHandle ? <Text style={styles.profileHandle}>{displayHandle}</Text> : null}
          </View>
        </View>

        {/* 소개 */}
        {profile?.bio ? <Text style={styles.profileBio}>{profile.bio}</Text> : null}

        {/* BLACK 달성 수 */}
        <View style={styles.profileStats}>
          <View style={styles.profileStat}>
            <Text style={styles.profileStatVal}>{stats.blackDays}</Text>
            <Text style={styles.profileStatLabel}>BLACK</Text>
          </View>
        </View>
      </View>

      {/* 구분선 */}
      <View style={styles.divider} />

      {/* ══════════════════════════════════════════════
          3단계 ▼ 통계 카드 4개 + 평균 완료율
      ══════════════════════════════════════════════ */}
      <View style={styles.statsSection}>
        {/* 2×2 그리드 */}
        {loadingStats ? (
          <ActivityIndicator color={C.muted} style={{ marginVertical: 32 }} />
        ) : (
          <>
            <View style={styles.statGrid}>
              {[
                { label: '완료한 할 일', value: stats.totalDone,  unit: '개' },
                { label: '활동한 날',    value: stats.activeDays, unit: '일' },
                { label: 'BLACK 달성',   value: stats.blackDays,  unit: '일' },
                { label: '연속 달성',    value: stats.streak,     unit: '일 연속' },
              ].map(({ label, value, unit }) => (
                <View key={label} style={styles.statCard}>
                  <Text style={styles.statCardLabel}>{label}</Text>
                  <Text style={styles.statCardValue}>
                    {value}
                    <Text style={styles.statCardUnit}> {unit}</Text>
                  </Text>
                </View>
              ))}
            </View>

            {/* 평균 완료율 */}
            <View style={styles.avgCard}>
              <View style={styles.avgRow}>
                <Text style={styles.avgLabel}>이번 달 평균 완료율</Text>
                <Text style={styles.avgValue}>{avgPct}%</Text>
              </View>
              <View style={styles.avgTrack}>
                <View style={[styles.avgFill, { width: `${avgPct}%` }]} />
              </View>
            </View>

            {/* ══════════════════════════════════════════
                3단계 ▼ 요일별 완료율 막대 그래프
            ══════════════════════════════════════════ */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>요일별 평균 완료율</Text>
              <View style={styles.chartBars}>
                {byDow.map(({ dow, avg, count }) => {
                  const barColor = dow === 0 ? '#ff7070' : dow === 6 ? '#7090ff' : '#6c8fff';
                  const barH     = Math.max(avg * 100, count > 0 ? 4 : 0);
                  return (
                    <View key={dow} style={styles.chartBarWrap}>
                      <View style={styles.chartBarTrack}>
                        <View style={[
                          styles.chartBarFill,
                          {
                            height:           `${barH}%`,
                            backgroundColor:  barColor,
                            opacity:          count > 0 ? 0.85 : 0.15,
                          },
                        ]} />
                      </View>
                      <Text style={[styles.chartBarLabel, { color: barColor }]}>
                        {DOW_KR[dow]}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* ══════════════════════════════════════════
                3단계 ▼ 월간 히트맵
            ══════════════════════════════════════════ */}
            <View style={styles.heatCard}>
              <Text style={styles.heatTitle}>이달 진행 현황</Text>

              {/* 요일 헤더 */}
              <View style={styles.heatDowRow}>
                {DOW_KR.map((d, i) => (
                  <Text
                    key={d}
                    style={[
                      styles.heatDowLabel,
                      i === 0 && { color: '#ff7070' },
                      i === 6 && { color: '#7090ff' },
                    ]}
                  >
                    {d}
                  </Text>
                ))}
              </View>

              {/* 날짜 그리드 */}
              {heatRows.map((row, ri) => (
                <View key={ri} style={styles.heatRow}>
                  {row.map((cell, ci) => {
                    if (!cell) return <View key={ci} style={styles.heatCell} />;
                    const alpha = cell.prog > 0 ? 0.2 + cell.prog * 0.8 : 0;
                    const bg    = cell.isBlack ? '#fff'
                      : cell.prog > 0 ? `rgba(108,143,255,${alpha.toFixed(2)})`
                      : C.card;
                    return (
                      <View key={ci} style={[styles.heatCell, { backgroundColor: bg }]}>
                        <Text style={[
                          styles.heatDayNum,
                          cell.isBlack    && { color: '#080808', fontWeight: '700' },
                          !cell.isBlack && cell.prog > 0.5 && { color: '#fff' },
                        ]}>
                          {cell.day}
                        </Text>
                        {cell.isBlack && <View style={styles.heatBlackRing} />}
                      </View>
                    );
                  })}
                </View>
              ))}

              {/* 범례 */}
              <View style={styles.heatLegend}>
                <View style={[styles.heatLegendDot, { backgroundColor: C.card, borderWidth: 1, borderColor: C.border }]} />
                <Text style={styles.heatLegendTxt}>없음</Text>
                <View style={[styles.heatLegendDot, { backgroundColor: 'rgba(108,143,255,0.6)' }]} />
                <Text style={styles.heatLegendTxt}>진행중</Text>
                <View style={[styles.heatLegendDot, { backgroundColor: '#fff' }]} />
                <Text style={styles.heatLegendTxt}>BLACK</Text>
              </View>
            </View>
          </>
        )}
      </View>

      <View style={{ height: 100 }} />

      {/* ── 설정 시트 ── */}
      {showSettings && (
        <SettingsSheet
          settings={settings}
          updSetting={updSetting}
          profile={profile}
          userId={userId}
          onProfileUpdate={loadProfile}
          onAvatarPress={pickAndUploadAvatar}
          uploadingAvatar={uploadingAvatar}
          onClose={() => setShowSettings(false)}
        />
      )}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════
// 2단계 ▼ Toggle
// ══════════════════════════════════════════════════════

function Toggle({ on, onChange }) {
  return (
    <Switch
      value={!!on}
      onValueChange={onChange}
      trackColor={{ false: '#2a2a2a', true: C.text }}
      thumbColor={on ? '#0a0a0a' : '#555'}
    />
  );
}

// ══════════════════════════════════════════════════════
// 2단계 ▼ SettingRow
// ══════════════════════════════════════════════════════

function SettingRow({ label, sub, children, last }) {
  return (
    <View style={[ssStyles.row, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={ssStyles.rowLabel}>{label}</Text>
        {sub ? <Text style={ssStyles.rowSub}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// ══════════════════════════════════════════════════════
// 2단계 ▼ SettingsSheet — 바텀 모달
// ══════════════════════════════════════════════════════

function SettingsSheet({ settings, updSetting, profile, userId, onProfileUpdate, onAvatarPress, uploadingAvatar, onClose }) {
  const insets = useSafeAreaInsets();

  // ── 섹션 네비게이션 ──────────────────────────────
  const [section, setSection] = useState(null);

  // ── 계정 관리 ─────────────────────────────────────
  const [editField,    setEditField]    = useState(null); // { key, value }
  const [handleError,  setHandleError]  = useState('');
  const [handleOk,     setHandleOk]     = useState(false);
  const [savingField,  setSavingField]  = useState(false);

  // ── PIN ───────────────────────────────────────────
  const [pinInput,   setPinInput]   = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStep,    setPinStep]    = useState(1); // 0=현재PIN확인, 1=새PIN, 2=확인
  const [savedPin,   setSavedPin]   = useState('');

  // ── 알림 시간 ─────────────────────────────────────
  const [remHour, setRemHour]     = useState(() => parseInt(settings.reminderTime?.split(':')[0] ?? '21', 10));
  const [remMinute, setRemMinute] = useState(() => parseInt(settings.reminderTime?.split(':')[1] ?? '0', 10));

  // ── PIN 로드 ──────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(PIN_KEY).then(v => {
      if (v) {
        setSavedPin(v);
        setPinStep(0);
      } else {
        setPinStep(1);
      }
    });
  }, []);

  // ── 핸들 검증 ─────────────────────────────────────
  const HANDLE_RE = /^[a-z0-9_]{2,20}$/i;

  const validateHandleFormat = (raw) => {
    const v = raw.startsWith('@') ? raw.slice(1) : raw;
    return HANDLE_RE.test(v);
  };

  const checkHandleAvailable = async (raw) => {
    const v = raw.startsWith('@') ? raw.slice(1) : raw;
    if (!validateHandleFormat(v)) {
      setHandleError('영문, 숫자, _만 사용 가능 (2~20자)');
      setHandleOk(false);
      return false;
    }
    if (v.toLowerCase() === (profile?.handle ?? '').toLowerCase()) {
      setHandleError('');
      setHandleOk(false);
      return false;
    }
    try {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('handle', v.toLowerCase())
        .neq('id', userId)
        .maybeSingle();
      if (data) {
        setHandleError('이미 사용 중인 아이디예요');
        setHandleOk(false);
        return false;
      }
      setHandleError('');
      setHandleOk(true);
      return true;
    } catch {
      setHandleError('');
      setHandleOk(false);
      return false;
    }
  };

  // ── 계정 필드 저장 ────────────────────────────────
  const saveField = async (key, value) => {
    setSavingField(true);
    try {
      const payload = { [key]: key === 'handle' ? value.replace('@', '').toLowerCase() : value };
      const { error } = await supabase
        .from('users')
        .update(payload)
        .eq('id', userId);
      if (error) throw error;
      await onProfileUpdate();
      setEditField(null);
      setHandleError('');
      setHandleOk(false);
    } catch {
      Alert.alert('저장 실패', '다시 시도해 주세요');
    } finally {
      setSavingField(false);
    }
  };

  // ── 알림 시간 저장 ────────────────────────────────
  const applyReminderTime = (h, m) => {
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    updSetting('reminderTime', time);
  };

  // ── PIN 키패드 핸들러 ──────────────────────────────
  const onPinKey = (k) => {
    if (!k) return;
    if (pinStep === 0) {
      // 기존 PIN 확인
      const next = k === '⌫' ? pinConfirm.slice(0, -1) : pinConfirm + k;
      setPinConfirm(next);
      if (next.length === 4) {
        if (next === savedPin) {
          setPinStep(1);
          setPinConfirm('');
        } else {
          setTimeout(() => setPinConfirm(''), 300);
        }
      }
    } else if (pinStep === 1) {
      if (k === '⌫') { setPinInput(v => v.slice(0, -1)); return; }
      const next = pinInput + k;
      setPinInput(next);
      if (next.length === 4) setPinStep(2);
    } else {
      if (k === '⌫') { setPinConfirm(v => v.slice(0, -1)); return; }
      const next = pinConfirm + k;
      setPinConfirm(next);
      if (next.length === 4) {
        if (next === pinInput) {
          AsyncStorage.setItem(PIN_KEY, pinInput);
          setSavedPin(pinInput);
          updSetting('pinLock', true);
          setPinStep(0);
          setPinInput('');
          setPinConfirm('');
          Alert.alert('PIN 설정 완료', 'PIN이 저장됐어요');
        } else {
          setTimeout(() => { setPinStep(1); setPinInput(''); setPinConfirm(''); }, 300);
        }
      }
    }
  };

  // ── PIN 잠금 토글 ─────────────────────────────────
  const onPinLockToggle = (v) => {
    if (!v) {
      AsyncStorage.removeItem(PIN_KEY);
      setSavedPin('');
      setPinStep(1);
      setPinInput('');
      setPinConfirm('');
      updSetting('pinLock', false);
    } else {
      updSetting('pinLock', true);
      setPinStep(savedPin ? 0 : 1);
    }
  };

  // ── 뒤로가기 ──────────────────────────────────────
  const back = () => {
    setSection(null);
    setEditField(null);
    setHandleError('');
    setHandleOk(false);
  };

  // ── 섹션 목록 ──────────────────────────────────────
  const sections = [
    { key: 'account',      icon: '◎', label: '계정 관리',          sub: profile?.handle ? `@${profile.handle}` : '' },
    { key: 'notification', icon: '◉', label: '알림 설정',           sub: settings.reminderOn ? `매일 ${settings.reminderTime}` : '꺼짐' },
    { key: 'app',          icon: '⌘', label: '앱 설정',             sub: '캘린더 · 언어' },
    { key: 'palette',      icon: '✦', label: '팔레트 설정',         sub: '애니메이션 · 크기' },
    { key: 'pin',          icon: '◆', label: '앱 잠금 (PIN)',       sub: settings.pinLock ? '설정됨' : '꺼짐' },
    { key: 'info',         icon: '◌', label: '버전 정보 / 피드백',   sub: 'v0.1.0-beta' },
  ];

  const currentSection = sections.find(s => s.key === section);
  const pinCur = pinStep === 0 ? pinConfirm : pinStep === 1 ? pinInput : pinConfirm;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ssStyles.backdrop} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={ssStyles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={[ssStyles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          {/* 드래그 핸들 */}
          <View style={ssStyles.handle} />

          {/* 헤더 */}
          <View style={ssStyles.header}>
            {section ? (
              <TouchableOpacity onPress={back} style={ssStyles.backBtn} hitSlop={8}>
                <Text style={ssStyles.backBtnTxt}>‹</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={ssStyles.headerTitle}>
              {section ? currentSection?.label : '설정'}
            </Text>
            <TouchableOpacity onPress={onClose} style={ssStyles.closeBtn} hitSlop={8}>
              <Text style={ssStyles.closeBtnTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={ssStyles.body} showsVerticalScrollIndicator={false}>

            {/* ── 메인 메뉴 ── */}
            {!section && sections.map((s, i) => (
              <TouchableOpacity
                key={s.key}
                onPress={() => setSection(s.key)}
                style={[ssStyles.menuRow, i === sections.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={ssStyles.menuIcon}>
                  <Text style={ssStyles.menuIconTxt}>{s.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ssStyles.menuLabel}>{s.label}</Text>
                  {s.sub ? <Text style={ssStyles.menuSub}>{s.sub}</Text> : null}
                </View>
                <Text style={ssStyles.chevron}>›</Text>
              </TouchableOpacity>
            ))}

            {/* ══════════════════════════════════════════════
                계정 관리
            ══════════════════════════════════════════════ */}
            {section === 'account' && (
              <>
                {/* 프로필 사진 */}
                <View style={ssStyles.avatarRow}>
                  <TouchableOpacity onPress={onAvatarPress} style={ssStyles.avatarCircle} activeOpacity={0.8}>
                    {profile?.avatar_url ? (
                      <Image source={{ uri: profile.avatar_url }} style={ssStyles.avatarCircleImg} />
                    ) : (
                      <Text style={ssStyles.avatarCircleTxt}>
                        {profile?.name?.[0]?.toUpperCase() ?? '?'}
                      </Text>
                    )}
                    {uploadingAvatar && (
                      <View style={ssStyles.avatarCircleOverlay}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={onAvatarPress} disabled={uploadingAvatar}>
                    <Text style={ssStyles.editBtnTxt}>
                      {uploadingAvatar ? '업로드 중...' : '사진 변경'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 이름 */}
                <AccountField
                  label="이름"
                  value={profile?.name ?? ''}
                  editField={editField}
                  fieldKey="name"
                  setEditField={setEditField}
                  onSave={(v) => saveField('name', v)}
                  saving={savingField}
                />

                {/* 소개 */}
                <AccountField
                  label="소개"
                  value={profile?.bio ?? ''}
                  editField={editField}
                  fieldKey="bio"
                  setEditField={setEditField}
                  onSave={(v) => saveField('bio', v)}
                  saving={savingField}
                  multiline
                  placeholder="소개를 입력해 주세요"
                />

                {/* 핸들 — 별도 검증 UI */}
                <View style={[ssStyles.row, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 6 }}>
                    <Text style={ssStyles.fieldLabel}>고유 아이디 (핸들)</Text>
                    <Text style={[ssStyles.rowSub, { fontSize: 9 }]}>팀 초대 시 사용돼요</Text>
                  </View>
                  {editField?.key === 'handle' ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 6 }}>
                        <Text style={ssStyles.atPrefix}>@</Text>
                        <TextInput
                          value={editField.value.startsWith('@') ? editField.value.slice(1) : editField.value}
                          onChangeText={async (t) => {
                            const v = t.toLowerCase().replace(/[^a-z0-9_]/g, '');
                            setEditField(ef => ({ ...ef, value: v }));
                            if (v.length >= 2) checkHandleAvailable('@' + v);
                            else { setHandleError(''); setHandleOk(false); }
                          }}
                          autoFocus
                          maxLength={20}
                          autoCapitalize="none"
                          style={[
                            ssStyles.handleInput,
                            handleError && { borderColor: '#ff6b6b' },
                            handleOk    && { borderColor: '#5ce65c' },
                          ]}
                        />
                        {handleOk ? <Text style={ssStyles.handleCheck}>✓</Text> : null}
                      </View>
                      {handleError ? <Text style={ssStyles.handleErr}>{handleError}</Text> : null}
                      {handleOk ? <Text style={ssStyles.handleGood}>사용 가능한 아이디예요</Text> : null}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, width: '100%' }}>
                        <TouchableOpacity
                          onPress={() => { setEditField(null); setHandleError(''); setHandleOk(false); }}
                          style={ssStyles.fieldCancelBtn}
                        >
                          <Text style={{ color: C.muted, fontSize: 12 }}>취소</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleOk && saveField('handle', editField.value)}
                          style={[ssStyles.fieldSaveBtn, !handleOk && ssStyles.fieldSaveBtnDisabled]}
                          disabled={!handleOk || savingField}
                        >
                          <Text style={{ color: handleOk ? C.bg : C.dim, fontSize: 12, fontWeight: '700' }}>
                            {savingField ? '저장 중...' : '저장'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <Text style={[ssStyles.fieldValue, { fontVariant: ['tabular-nums'] }]}>
                        {profile?.handle ? `@${profile.handle}` : <Text style={{ color: C.dim }}>미설정</Text>}
                      </Text>
                      <TouchableOpacity onPress={() => { setEditField({ key: 'handle', value: profile?.handle ?? '' }); setHandleError(''); setHandleOk(false); }}>
                        <Text style={ssStyles.editBtnTxt}>변경</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* 로그아웃 */}
                <TouchableOpacity style={ssStyles.logoutBtn} onPress={() => {
                  Alert.alert('로그아웃', '로그아웃 할까요?', [
                    { text: '취소', style: 'cancel' },
                    { text: '로그아웃', style: 'destructive', onPress: () => supabase.auth.signOut() },
                  ]);
                }}>
                  <Text style={ssStyles.logoutTxt}>로그아웃</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ══════════════════════════════════════════════
                알림 설정
            ══════════════════════════════════════════════ */}
            {section === 'notification' && (
              <>
                <SettingRow label="매일 리마인더" sub="설정한 시간에 알림을 보내요">
                  <Toggle
                    on={settings.reminderOn}
                    onChange={(v) => {
                      if (v) {
                        Alert.alert('알림 기능', 'APK 설치 버전에서 사용할 수 있어요');
                      }
                      updSetting('reminderOn', v);
                    }}
                  />
                </SettingRow>
                {settings.reminderOn && (
                  <View style={[ssStyles.row, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                    <Text style={[ssStyles.rowSub, { marginBottom: 12 }]}>리마인더 시간</Text>
                    <View style={ssStyles.timePicker}>
                      {/* 시 */}
                      <View style={ssStyles.timeUnit}>
                        <TouchableOpacity onPress={() => { const h = (remHour + 1) % 24; setRemHour(h); applyReminderTime(h, remMinute); }} style={ssStyles.timeBtn}>
                          <Text style={ssStyles.timeBtnTxt}>▲</Text>
                        </TouchableOpacity>
                        <Text style={ssStyles.timeValue}>{String(remHour).padStart(2, '0')}</Text>
                        <TouchableOpacity onPress={() => { const h = (remHour - 1 + 24) % 24; setRemHour(h); applyReminderTime(h, remMinute); }} style={ssStyles.timeBtn}>
                          <Text style={ssStyles.timeBtnTxt}>▼</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={ssStyles.timeSep}>:</Text>
                      {/* 분 (5분 단위) */}
                      <View style={ssStyles.timeUnit}>
                        <TouchableOpacity onPress={() => { const m = (remMinute + 5) % 60; setRemMinute(m); applyReminderTime(remHour, m); }} style={ssStyles.timeBtn}>
                          <Text style={ssStyles.timeBtnTxt}>▲</Text>
                        </TouchableOpacity>
                        <Text style={ssStyles.timeValue}>{String(remMinute).padStart(2, '0')}</Text>
                        <TouchableOpacity onPress={() => { const m = (remMinute - 5 + 60) % 60; setRemMinute(m); applyReminderTime(remHour, m); }} style={ssStyles.timeBtn}>
                          <Text style={ssStyles.timeBtnTxt}>▼</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}

            {/* ══════════════════════════════════════════════
                앱 설정
            ══════════════════════════════════════════════ */}
            {section === 'app' && (
              <>
                <SettingRow label="캘린더 시작 요일" sub="일요일부터 시작">
                  <Toggle on={settings.calStartSunday} onChange={v => updSetting('calStartSunday', v)} />
                </SettingRow>
                <SettingRow label="언어" sub="Language" last>
                  <View style={ssStyles.chipRow}>
                    {[['ko', '한국어'], ['en', 'English']].map(([k, l]) => (
                      <TouchableOpacity
                        key={k}
                        onPress={() => updSetting('language', k)}
                        style={[ssStyles.chip, settings.language === k && ssStyles.chipActive]}
                      >
                        <Text style={[ssStyles.chipTxt, settings.language === k && ssStyles.chipTxtActive]}>{l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </SettingRow>
              </>
            )}

            {/* ══════════════════════════════════════════════
                팔레트 설정
            ══════════════════════════════════════════════ */}
            {section === 'palette' && (
              <>
                <SettingRow label="BLACK 달성 애니메이션" sub="홈 화면 완료 시 연출 효과">
                  <Toggle on={settings.blackAnimationOn} onChange={v => updSetting('blackAnimationOn', v)} />
                </SettingRow>
                <SettingRow label="팀 BLACK 애니메이션" sub="팀 화면 완료 시 연출 효과">
                  <Toggle
                    on={settings.teamBlackAnimationOn !== false}
                    onChange={v => updSetting('teamBlackAnimationOn', v)}
                  />
                </SettingRow>
                <SettingRow label="팔레트 크기" last>
                  <View style={ssStyles.chipRow}>
                    {[['small', '소'], ['medium', '중'], ['large', '대']].map(([k, l]) => (
                      <TouchableOpacity
                        key={k}
                        onPress={() => updSetting('paletteSize', k)}
                        style={[ssStyles.chip, ssStyles.chipSq, settings.paletteSize === k && ssStyles.chipActive]}
                      >
                        <Text style={[ssStyles.chipTxt, settings.paletteSize === k && ssStyles.chipTxtActive]}>{l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </SettingRow>
              </>
            )}

            {/* ══════════════════════════════════════════════
                PIN 잠금
            ══════════════════════════════════════════════ */}
            {section === 'pin' && (
              <>
                <SettingRow label="앱 잠금" sub="앱 시작 시 PIN 입력">
                  <Toggle on={settings.pinLock} onChange={onPinLockToggle} />
                </SettingRow>
                {settings.pinLock && (
                  <View style={ssStyles.pinWrap}>
                    <Text style={ssStyles.pinPrompt}>
                      {pinStep === 0 ? '현재 PIN을 입력해주세요'
                        : pinStep === 1 ? '새 PIN 4자리 입력'
                        : 'PIN 확인 (다시 입력)'}
                    </Text>
                    {/* 도트 표시 */}
                    <View style={ssStyles.pinDots}>
                      {Array.from({ length: 4 }, (_, i) => (
                        <View
                          key={i}
                          style={[
                            ssStyles.pinDot,
                            pinCur.length > i && ssStyles.pinDotFilled,
                          ]}
                        >
                          {pinCur.length > i ? <Text style={ssStyles.pinDotTxt}>●</Text> : null}
                        </View>
                      ))}
                    </View>
                    {/* 키패드 */}
                    <View style={ssStyles.keypad}>
                      {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                        <TouchableOpacity
                          key={i}
                          onPress={() => onPinKey(k)}
                          style={[ssStyles.keyBtn, !k && { backgroundColor: 'transparent', borderWidth: 0 }]}
                          disabled={!k}
                          activeOpacity={0.7}
                        >
                          <Text style={ssStyles.keyBtnTxt}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}

            {/* ══════════════════════════════════════════════
                버전 정보
            ══════════════════════════════════════════════ */}
            {section === 'info' && (
              <>
                <View style={ssStyles.infoHeader}>
                  <Text style={ssStyles.infoOrb}>●</Text>
                  <Text style={ssStyles.infoAppName}>MakeBlack</Text>
                  <Text style={ssStyles.infoVersion}>v0.1.0-beta</Text>
                </View>
                {[
                  { label: '버그 신고',          sub: '불편한 점을 알려주세요' },
                  { label: '기능 제안',          sub: '원하는 기능을 제안해 주세요' },
                  { label: '앱 평가하기',        sub: '스토어에서 리뷰 남기기' },
                  { label: '개인정보 처리방침' },
                  { label: '서비스 이용약관' },
                ].map((item, i, arr) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[ssStyles.menuRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => Alert.alert(item.label, '준비 중이에요')}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={ssStyles.menuLabel}>{item.label}</Text>
                      {item.sub ? <Text style={ssStyles.menuSub}>{item.sub}</Text> : null}
                    </View>
                    <Text style={ssStyles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════
// 2단계 ▼ AccountField — 인라인 편집 필드
// ══════════════════════════════════════════════════════

function AccountField({ label, value, editField, fieldKey, setEditField, onSave, saving, multiline, placeholder }) {
  return (
    <View style={[ssStyles.row, multiline && { flexDirection: 'column', alignItems: 'flex-start' }]}>
      <Text style={[ssStyles.fieldLabel, multiline && { marginBottom: 6 }]}>{label}</Text>
      {editField?.key === fieldKey ? (
        <View style={[{ flexDirection: 'row', gap: 8 }, multiline && { width: '100%', marginTop: 4 }]}>
          <TextInput
            value={editField.value}
            onChangeText={t => setEditField(ef => ({ ...ef, value: t }))}
            autoFocus
            multiline={multiline}
            numberOfLines={multiline ? 3 : 1}
            placeholder={placeholder}
            placeholderTextColor={C.dim}
            style={[ssStyles.fieldInput, multiline && { height: 72, textAlignVertical: 'top' }]}
          />
          <TouchableOpacity
            onPress={() => onSave(editField.value)}
            style={ssStyles.fieldSaveBtn}
            disabled={saving}
          >
            <Text style={{ color: C.bg, fontSize: 12, fontWeight: '700' }}>
              {saving ? '...' : '저장'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: multiline ? 0 : 1, width: multiline ? '100%' : undefined }}>
          <Text style={ssStyles.fieldValue}>{value || <Text style={{ color: C.dim }}>{placeholder ?? '미입력'}</Text>}</Text>
          <TouchableOpacity onPress={() => setEditField({ key: fieldKey, value })}>
            <Text style={ssStyles.editBtnTxt}>변경</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════
// 5단계 ▼ StyleSheet
// ══════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── 프로필 헤더 ───────────────────────────────────
  profileSection: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 20 },

  gearBtn: {
    position: 'absolute', top: 28, right: 20,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  gearBtnTxt: { color: C.muted, fontSize: 15 },

  profileRow:   { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#6c5fce',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    overflow: 'hidden',
  },
  avatarImg:     { width: 64, height: 64, borderRadius: 32 },
  avatarTxt:     { fontSize: 26, color: '#fff', fontWeight: '700' },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  profileName:   { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.36 },
  profileHandle: { fontSize: 12, color: C.muted, marginTop: 2 },
  profileBio:    { fontSize: 13, color: C.dim, lineHeight: 20, marginBottom: 10 },

  profileStats:    { flexDirection: 'row', gap: 24 },
  profileStat:     { alignItems: 'center' },
  profileStatVal:  { fontSize: 18, fontWeight: '700', color: C.text },
  profileStatLabel:{ fontSize: 10, color: C.dim, marginTop: 2, letterSpacing: 0.6 },

  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 20 },

  // ── 통계 섹션 ─────────────────────────────────────
  statsSection: { paddingHorizontal: 20, paddingTop: 20 },

  // 2×2 그리드
  statGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statCard: {
    width: '48%', flexGrow: 1,
    backgroundColor: C.surface, borderRadius: R.lg,
    padding: 16, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: C.border,
  },
  statCardLabel: { fontSize: 10, color: C.muted, marginBottom: 6, letterSpacing: 0.6 },
  statCardValue: { fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.78, lineHeight: 30 },
  statCardUnit:  { fontSize: 12, fontWeight: '400', color: C.muted },

  // 평균 완료율
  avgCard: {
    backgroundColor: C.surface, borderRadius: R.lg,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  avgRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  avgLabel: { fontSize: 12, color: C.muted },
  avgValue: { fontSize: 20, fontWeight: '700', color: C.text },
  avgTrack: { height: 5, borderRadius: 4, backgroundColor: C.card, overflow: 'hidden' },
  avgFill:  { height: '100%', borderRadius: 4, backgroundColor: '#6c8fff' },

  // 요일별 막대 차트
  chartCard: {
    backgroundColor: C.surface, borderRadius: R.lg,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  chartTitle:   { fontSize: 12, color: C.muted, marginBottom: 14 },
  chartBars:    { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 72 },
  chartBarWrap: { flex: 1, alignItems: 'center', gap: 5 },
  chartBarTrack:{ width: '100%', backgroundColor: C.card, borderRadius: 3, height: 56, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBarFill: { width: '100%', borderRadius: 3 },
  chartBarLabel:{ fontSize: 9 },

  // 월간 히트맵
  heatCard: {
    backgroundColor: C.surface, borderRadius: R.lg,
    padding: 16, marginBottom: 0,
    borderWidth: 1, borderColor: C.border,
  },
  heatTitle:     { fontSize: 12, color: C.muted, marginBottom: 12 },
  heatDowRow:    { flexDirection: 'row', marginBottom: 6, gap: 3 },
  heatDowLabel:  { flex: 1, textAlign: 'center', fontSize: 9, color: C.dim },
  heatRow:       { flexDirection: 'row', gap: 3, marginBottom: 3 },
  heatCell: {
    flex: 1, aspectRatio: 1,
    borderRadius: 5, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  heatDayNum:    { fontSize: 9, color: C.muted, fontWeight: '400' },
  heatBlackRing: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  heatLegend:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  heatLegendDot: { width: 9, height: 9, borderRadius: 2 },
  heatLegendTxt: { fontSize: 10, color: C.dim },
});

// SettingsSheet 전용 스타일
const ssStyles = StyleSheet.create({
  // 바텀 모달
  backdrop:   { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetWrap:  { flex: 1, justifyContent: 'flex-end' },
  sheet:      { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%' },
  handle:     { width: 34, height: 4, borderRadius: 2, backgroundColor: C.border2, alignSelf: 'center', marginTop: 14 },

  // 헤더
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, gap: 10 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  backBtn:     { marginRight: 4 },
  backBtnTxt:  { color: C.muted, fontSize: 22, lineHeight: 24 },
  closeBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  closeBtnTxt: { color: C.muted, fontSize: 14, lineHeight: 16 },

  body: { paddingHorizontal: 20 },

  // 메인 메뉴 행
  menuRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  menuIcon:   { width: 34, height: 34, borderRadius: R.sm, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  menuIconTxt:{ color: C.muted, fontSize: 14 },
  menuLabel:  { fontSize: 13, color: C.text },
  menuSub:    { fontSize: 11, color: C.muted, marginTop: 2 },
  chevron:    { color: C.dim, fontSize: 16 },

  // SettingRow
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontSize: 14, color: C.text },
  rowSub:   { fontSize: 11, color: C.muted, marginTop: 2 },

  // 계정 아바타
  avatarRow:        { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  avatarCircle:     { width: 56, height: 56, borderRadius: 28, backgroundColor: '#6c5fce', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarCircleImg:  { width: 56, height: 56, borderRadius: 28 },
  avatarCircleTxt:  { fontSize: 22, color: '#fff', fontWeight: '700' },
  avatarCircleOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },

  // 계정 필드
  fieldLabel:         { fontSize: 10, color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  fieldValue:         { fontSize: 14, color: C.text },
  editBtnTxt:         { fontSize: 11, color: C.muted },
  fieldInput:         { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border2, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 8, color: C.text, fontSize: 13 },
  fieldSaveBtn:       { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.text, borderRadius: R.sm, justifyContent: 'center' },
  fieldSaveBtnDisabled: { backgroundColor: C.border2 },
  fieldCancelBtn:     { flex: 1, paddingVertical: 9, borderWidth: 1, borderColor: C.border2, borderRadius: R.sm, alignItems: 'center' },

  // 핸들 전용
  atPrefix:    { fontSize: 13, color: C.dim, marginRight: 4 },
  handleInput: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border2, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 9, color: C.text, fontSize: 13 },
  handleCheck: { position: 'absolute', right: 10, fontSize: 12, color: '#5ce65c' },
  handleErr:   { fontSize: 11, color: '#ff6b6b', marginBottom: 4 },
  handleGood:  { fontSize: 11, color: '#5ce65c', marginBottom: 4 },

  // 알림 시간
  timePicker: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeUnit:   { alignItems: 'center', gap: 4 },
  timeBtn:    { padding: 6 },
  timeBtnTxt: { color: C.muted, fontSize: 12 },
  timeValue:  { color: C.text, fontSize: 26, fontWeight: '700', minWidth: 44, textAlign: 'center' },
  timeSep:    { color: C.text, fontSize: 26, fontWeight: '700', marginBottom: 4 },

  // 칩 버튼
  chipRow:         { flexDirection: 'row', gap: 6 },
  chip:            { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.full, backgroundColor: C.card, borderWidth: 1, borderColor: C.border2 },
  chipSq:          { paddingHorizontal: 0, width: 36, alignItems: 'center' },
  chipActive:      { backgroundColor: C.text, borderColor: C.text },
  chipTxt:         { fontSize: 11, color: C.muted },
  chipTxtActive:   { color: C.bg },

  // PIN
  pinWrap:    { paddingTop: 16 },
  pinPrompt:  { fontSize: 12, color: C.muted, marginBottom: 14 },
  pinDots:    { flexDirection: 'row', gap: 10, marginBottom: 20 },
  pinDot:     { width: 42, height: 52, borderRadius: R.sm, backgroundColor: C.card, borderWidth: 1, borderColor: C.border2, alignItems: 'center', justifyContent: 'center' },
  pinDotFilled: { borderColor: '#6c8fff' },
  pinDotTxt:  { fontSize: 20, color: C.text },
  keypad:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keyBtn:     { width: '30%', height: 48, borderRadius: R.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  keyBtnTxt:  { color: C.text, fontSize: 20, fontWeight: '500' },

  // 버전 정보
  infoHeader:  { alignItems: 'center', paddingVertical: 24 },
  infoOrb:     { fontSize: 32, color: C.text, marginBottom: 8 },
  infoAppName: { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: 2 },
  infoVersion: { fontSize: 12, color: C.muted, marginTop: 4 },

  // 로그아웃
  logoutBtn: { marginTop: 24, paddingVertical: 14, borderRadius: R.md, borderWidth: 1, borderColor: '#2a1a1a', alignItems: 'center', backgroundColor: '#120a0a' },
  logoutTxt: { color: '#ff6b6b', fontSize: 14, fontWeight: '600' },
});
