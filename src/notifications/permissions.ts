import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const CHANNELS = {
  motivation: 'motivation',
  streak: 'streak',
  hydration: 'hydration',
  coaching: 'coaching',
} as const;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNELS.motivation, {
    name: 'Daily motivation',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.streak, {
    name: 'Streak reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.hydration, {
    name: 'Water & meal reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.coaching, {
    name: 'Coaching updates',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export type PermissionResult = 'granted' | 'denied' | 'undetermined';

export async function getNotificationPermission(): Promise<PermissionResult> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/** Request permission only when caller decides context is right. */
export async function requestNotificationPermission(): Promise<boolean> {
  await ensureAndroidChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (!current.canAskAgain && current.status === 'denied') return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}
