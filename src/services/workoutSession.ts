import AsyncStorage from '@react-native-async-storage/async-storage';
import { workouts } from './api';
import type { SetLog } from '../types/models';

const ACTIVE_SESSION_KEY = 'ironlog.activeWorkoutSession';

type StoredSession = { dayKey: string; sessionId: string };
export type LoggedSet = Omit<SetLog, 'id' | 'sessionId' | 'completed'>;

export async function readStoredSession(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.dayKey || !parsed?.sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeStoredSession(dayKey: string, sessionId: string) {
  await AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ dayKey, sessionId } satisfies StoredSession));
}

export async function clearStoredSession() {
  await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
}

export async function persistWorkoutSet(
  set: LoggedSet,
  opts: {
    dayKey: string;
    currentSessionId: string | null;
    startedAt?: string | null;
    userProgramId?: string;
    programId?: string;
    dayIndex?: number;
    dayLabel?: string;
  }
) {
  if (!opts.currentSessionId) {
    const startedAt = opts.startedAt ?? new Date().toISOString();
    const session = await workouts.log({
      startedAt,
      sets: [set],
      userProgramId: opts.userProgramId,
      programId: opts.programId,
      dayIndex: opts.dayIndex,
      dayLabel: opts.dayLabel,
    });
    const sessionId = session._id || session.id;
    await writeStoredSession(opts.dayKey, sessionId);
    return { sessionId, startedAt: session.startedAt ?? startedAt, set: session.sets?.[0] };
  }
  const result = await workouts.addSet(opts.currentSessionId, set);
  return {
    sessionId: opts.currentSessionId,
    startedAt: opts.startedAt ?? new Date().toISOString(),
    set: result.sets[0],
  };
}
