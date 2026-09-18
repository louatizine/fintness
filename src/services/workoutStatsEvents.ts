import type { WorkoutSummary } from '../types/models';

export type WorkoutStatsOptimisticDelta = {
  workoutsCompletedDelta?: number;
  totalVolumeDelta?: number;
  streakDelta?: number;
  /** When set, session/volume deltas apply only if this session is not already in the summary. */
  sessionId?: string;
};

type Listener = (payload: { optimistic?: WorkoutStatsOptimisticDelta }) => void;

const listeners = new Set<Listener>();

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Notify Progress (and any other listeners) that overview stats should refresh. */
export function notifyWorkoutStatsChanged(payload: { optimistic?: WorkoutStatsOptimisticDelta } = {}) {
  for (const listener of listeners) listener(payload);
}

export function subscribeWorkoutStatsChanged(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyOptimisticSummary(
  current: WorkoutSummary | null,
  delta: WorkoutStatsOptimisticDelta | undefined
): WorkoutSummary | null {
  if (!current || !delta) return current;
  const alreadyCounted = delta.sessionId
    ? current.breakdown.sessions.some((row) => row.sessionId === delta.sessionId)
    : false;
  const sessionDelta = alreadyCounted ? 0 : (delta.workoutsCompletedDelta ?? 0);
  const volumeDelta = alreadyCounted ? 0 : (delta.totalVolumeDelta ?? 0);
  const today = localDateKey();
  const streakAlreadyToday = current.breakdown.streakDays.some((day) => day.date === today);
  const streakDelta = streakAlreadyToday ? 0 : (delta.streakDelta ?? 0);
  if (!sessionDelta && !volumeDelta && !streakDelta) {
    return { ...current, computedAt: new Date().toISOString() };
  }
  return {
    ...current,
    workoutsCompleted: Math.max(0, current.workoutsCompleted + sessionDelta),
    totalVolume: Math.max(0, current.totalVolume + volumeDelta),
    streak: Math.max(0, current.streak + streakDelta),
    computedAt: new Date().toISOString(),
  };
}
