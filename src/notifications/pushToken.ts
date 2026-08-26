import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { users } from '../services/api';
import { ensureAndroidChannels, requestNotificationPermission } from './permissions';

let cachedToken: string | null = null;

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  );
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'web') return null;

  await ensureAndroidChannels();
  const granted = await requestNotificationPermission();
  if (!granted) return null;

  const projectId = getProjectId();
  if (!projectId) {
    console.warn('Missing EAS projectId for push token');
    return null;
  }

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    cachedToken = result.data;
    return cachedToken;
  } catch (err) {
    console.warn('Failed to get Expo push token', err);
    return null;
  }
}

export async function registerPushTokenWithServer(): Promise<string | null> {
  const token = await getExpoPushToken();
  if (!token) return null;
  try {
    await users.registerPushToken(token);
  } catch (err) {
    console.warn('Failed to register push token', err);
  }
  return token;
}

export async function unregisterPushTokenFromServer(): Promise<void> {
  const token = cachedToken;
  if (!token) return;
  try {
    await users.unregisterPushToken(token);
  } catch {
    // ignore
  }
  cachedToken = null;
}
