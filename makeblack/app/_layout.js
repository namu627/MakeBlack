import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { STORAGE_KEYS } from '../constants/theme';

const SETTINGS_KEY   = STORAGE_KEYS.SETTINGS;
const PIN_KEY        = STORAGE_KEYS.PIN;
const ONBOARDING_KEY = STORAGE_KEYS.ONBOARDING;

// onboarding.js에서 호출해 _layout의 state를 직접 업데이트
let _markOnboardingDone = null;
export function markOnboardingDone() {
  _markOnboardingDone?.();
}

export default function RootLayout() {
  const [session,        setSession]        = useState(undefined);
  const [initialized,    setInitialized]    = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(null); // null = 아직 로딩중

  // 모듈 레벨 함수가 이 컴포넌트의 setter를 참조하게 연결
  useEffect(() => {
    _markOnboardingDone = () => setOnboardingDone(true);
    return () => { _markOnboardingDone = null; };
  }, []);

  // ── PIN 잠금 ──────────────────────────────────────
  const [pinLocked,  setPinLocked]  = useState(false);
  const [storedPin,  setStoredPin]  = useState('');
  const [pinEntry,   setPinEntry]   = useState('');

  useEffect(() => {
    // 현재 세션 확인
    supabase.auth.getSession()
      .then(({ data: { session } }) => { setSession(session); })
      .catch(() => {}) // 네트워크 에러 시 세션 없는 것으로 처리
      .finally(() => setInitialized(true));

    // 세션 변경 감지 — SIGNED_OUT(토큰 만료 포함) 시 즉시 로그인으로
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_OUT') {
        router.replace('/(auth)/login');
      }
    });

    // 앱 시작 시 PIN 잠금 + 온보딩 확인
    (async () => {
      try {
        const [raw, savedPin, obDone] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(PIN_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
        ]);
        if (raw && savedPin) {
          const s = JSON.parse(raw);
          // pinLock 설정이 켜져 있고 저장된 PIN이 있을 때만 잠금
          if (s.pinLock) {
            setStoredPin(savedPin);
            setPinLocked(true);
          }
        }
        setOnboardingDone(!!obDone);
      } catch (e) {
        setOnboardingDone(false);
      }
    })();

    return () => subscription.unsubscribe();
  }, []);

  // 세션 상태 변경 시 라우팅 (세션 + 온보딩 상태 둘 다 확인된 후에만)
  useEffect(() => {
    if (!initialized || onboardingDone === null) return;
    if (!onboardingDone) {
      router.replace('/onboarding');
    } else if (session) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/login');
    }
  }, [session, initialized, onboardingDone]);

  if (!initialized || onboardingDone === null) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
      </Stack>

      {/* ── PIN 잠금 게이트 ── */}
      {pinLocked && (
        <PinGate
          storedPin={storedPin}
          pinEntry={pinEntry}
          setPinEntry={setPinEntry}
          onUnlock={() => { setPinLocked(false); setPinEntry(''); }}
        />
      )}
    </GestureHandlerRootView>
  );
}

// ── PIN 입력 오버레이 ──────────────────────────────
function PinGate({ storedPin, pinEntry, setPinEntry, onUnlock }) {
  const onKey = (k) => {
    if (!k) return;
    if (k === '⌫') { setPinEntry(v => v.slice(0, -1)); return; }
    const next = pinEntry + k;
    setPinEntry(next);
    if (next.length === 4) {
      if (next === storedPin) {
        onUnlock();
      } else {
        setTimeout(() => setPinEntry(''), 300);
      }
    }
  };

  return (
    <View style={pinStyles.overlay}>
      <Text style={pinStyles.orb}>●</Text>
      <Text style={pinStyles.appName}>MakeBlack</Text>
      <Text style={pinStyles.prompt}>PIN을 입력해주세요</Text>

      {/* 도트 */}
      <View style={pinStyles.dots}>
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} style={[pinStyles.dot, pinEntry.length > i && pinStyles.dotFilled]}>
            {pinEntry.length > i ? <Text style={pinStyles.dotTxt}>●</Text> : null}
          </View>
        ))}
      </View>

      {/* 키패드 */}
      <View style={pinStyles.keypad}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => onKey(k)}
            style={[pinStyles.key, !k && { backgroundColor: 'transparent', borderWidth: 0 }]}
            disabled={!k}
            activeOpacity={0.7}
          >
            <Text style={pinStyles.keyTxt}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const pinStyles = StyleSheet.create({
  overlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 32, zIndex: 9999 },
  orb:       { fontSize: 32, color: '#f0ece6', marginBottom: 8 },
  appName:   { fontSize: 18, fontWeight: '700', color: '#f0ece6', letterSpacing: 2, marginBottom: 4 },
  prompt:    { fontSize: 12, color: '#888888', marginBottom: 36 },
  dots:      { flexDirection: 'row', gap: 12, marginBottom: 32 },
  dot:       { width: 42, height: 52, borderRadius: 10, backgroundColor: '#181818', borderWidth: 1, borderColor: '#2e2e2e', alignItems: 'center', justifyContent: 'center' },
  dotFilled: { borderColor: '#6c8fff' },
  dotTxt:    { fontSize: 20, color: '#f0ece6' },
  keypad:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: 216 },
  key:       { width: 64, height: 56, borderRadius: 16, backgroundColor: '#181818', borderWidth: 1, borderColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  keyTxt:    { color: '#f0ece6', fontSize: 20, fontWeight: '500' },
});