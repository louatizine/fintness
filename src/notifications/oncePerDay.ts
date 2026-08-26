import AsyncStorage from '@react-native-async-storage/async-storage';

function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function storageKey(type: string, date = new Date()): string {
  return `notif:lastFired:${type}:${dayKey(date)}`;
}

export async function hasFiredToday(type: string): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(storageKey(type));
    return value === '1';
  } catch {
    return false;
  }
}

export async function markFiredToday(type: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(type), '1');
  } catch {
    // ignore storage failures
  }
}

export async function tryClaimFireToday(type: string): Promise<boolean> {
  if (await hasFiredToday(type)) return false;
  await markFiredToday(type);
  return true;
}
