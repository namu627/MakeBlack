import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [session, setSession] = useState(undefined);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // 앱 시작 시 현재 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    // 세션 변경 감지 (로그인/로그아웃)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 세션 상태 변경 시 라우팅
  useEffect(() => {
    if (!initialized) return;

    if (session) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/login');
    }
  }, [session, initialized]);

  // 초기화 전엔 아무것도 안 보여줌
  if (!initialized) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}