import AsyncStorage from '@react-native-async-storage/async-storage';

const queueKey = 'fintness.pending-writes';

type PendingWrite = { collection: string; document: unknown };

export async function queueWrite(write: PendingWrite) {
  const current = await AsyncStorage.getItem(queueKey);
  const queue: PendingWrite[] = current ? JSON.parse(current) : [];
  queue.push(write);
  await AsyncStorage.setItem(queueKey, JSON.stringify(queue));
}

export async function getQueuedWrites() {
  const current = await AsyncStorage.getItem(queueKey);
  return (current ? JSON.parse(current) : []) as PendingWrite[];
}

export async function clearQueuedWrites() {
  await AsyncStorage.removeItem(queueKey);
}