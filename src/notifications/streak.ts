import * as Notifications from 'expo-notifications';
import type { WorkoutSession } from '../types/models';
import { tryClaimFireToday } from './oncePerDay';
import { CHANNELS } from './permissions';

const STREAK_HOURS = 48;

export function hoursSinceLastWorkout(sessions: WorkoutSession[], now = new Date()): number | null {
  if (!sessions.length) return null;
  let latest = 0;
  for (const session of sessions) {
    const t = new Date(session.completedAt || session.endedAt || session.startedAt).getTime();
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  if (!latest) return null;
  return (now.getTime() - latest) / (1000 * 60 * 60);
}

export function isStreakAtRisk(sessions: WorkoutSession[], now = new Date()): boolean {
  const hours = hoursSinceLastWorkout(sessions, now);
  if (hours === null) return false; // no history yet — don't nag new users
  return hours >= STREAK_HOURS;
}

/** Immediate local notify if streak at risk and not already fired today. */
export async function maybeNotifyStreakAtRisk(sessions: WorkoutSession[]): Promise<void> {
  if (!isStreakAtRisk(sessions)) return;
  const claimed = await tryClaimFireToday('streak');
  if (!claimed) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Streak at risk',
      body: "It's been 48+ hours since your last workout. Protect the streak today.",
      sound: true,
      data: { type: 'streak_at_risk' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: CHANNELS.streak,
    },
  });
}
