import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// 알림 수신 방식 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ── 알림 권한 요청 ─────────────────────────────────────
export const requestNotificationPermission = async () => {
  if (!Device.isDevice) return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return finalStatus === 'granted';
};

// ── 로컬 리마인더 예약 ────────────────────────────────
export const scheduleReminder = async (hour, minute) => {
  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '오늘 팔레트를 채워볼까요? 🎨',
      body: '할 일을 완료하고 BLACK에 도전해보세요',
    },
    trigger: {
      type: 'daily',
      hour,
      minute,
    },
  });

  console.log(`리마인더 설정: 매일 ${hour}:${String(minute).padStart(2,'0')}`);
};

// ── 리마인더 취소 ─────────────────────────────────────
export const cancelReminder = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
  console.log('리마인더 취소됨');
};