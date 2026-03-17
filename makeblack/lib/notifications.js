import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const isExpoGo = () => {
  try {
    const Constants = require('expo-constants').default;
    return Constants.appOwnership === 'expo';
  } catch {
    return false;
  }
};

if (!isExpoGo()) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export const requestNotificationPermission = async () => {
  if (isExpoGo()) return false;
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

export const scheduleReminder = async (hour, minute) => {
  if (isExpoGo()) return;
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
};

export const cancelReminder = async () => {
  if (isExpoGo()) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
};