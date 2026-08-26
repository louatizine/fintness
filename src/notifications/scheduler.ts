import * as Notifications from 'expo-notifications';
import type { NotificationPrefs, UserProfile } from '../types/models';
import { DEFAULT_NOTIFICATION_PREFS } from '../types/models';
import { exercises as exercisesApi, programs, workouts } from '../services/api';
import { selectDailyTip } from './selectDailyTip';
import { pickStaticTip, dateSeed } from './staticTips';
import { CHANNELS, ensureAndroidChannels, getNotificationPermission } from './permissions';
import { hasFiredToday } from './oncePerDay';
import { isStreakAtRisk, maybeNotifyStreakAtRisk } from './streak';

export const NOTIF_IDS = {
  dailyMotivation: 'daily-motivation',
  dailyMotivationBackup: 'daily-motivation-backup',
  streakCheck: 'streak-check',
  waterMeal: 'water-meal',
} as const;

function prefsOf(profile: UserProfile): NotificationPrefs {
  return profile.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
}

function nextOccurrence(hour: number, minute: number, from = new Date()): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function cancelAthleteLocals(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIF_IDS.dailyMotivation).catch(() => undefined);
  await Notifications.cancelScheduledNotificationAsync(NOTIF_IDS.dailyMotivationBackup).catch(() => undefined);
  await Notifications.cancelScheduledNotificationAsync(NOTIF_IDS.streakCheck).catch(() => undefined);
  await Notifications.cancelScheduledNotificationAsync(NOTIF_IDS.waterMeal).catch(() => undefined);
}

async function scheduleDailyMotivation(
  prefs: NotificationPrefs,
  tipBody: string,
  backupBody: string
): Promise<void> {
  const { hour, minute } = prefs.dailyMotivation;
  const first = nextOccurrence(hour, minute);
  const second = addDays(first, 1);

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_IDS.dailyMotivation,
    content: {
      title: 'Iron Log',
      body: tipBody,
      sound: true,
      data: { type: 'daily_motivation' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: first,
      channelId: CHANNELS.motivation,
    },
  });

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_IDS.dailyMotivationBackup,
    content: {
      title: 'Iron Log',
      body: backupBody,
      sound: true,
      data: { type: 'daily_motivation' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: second,
      channelId: CHANNELS.motivation,
    },
  });
}

async function scheduleStreakCheck(prefs: NotificationPrefs, shouldSchedule: boolean): Promise<void> {
  if (!prefs.streakAtRisk.enabled || !shouldSchedule) return;

  const when = nextOccurrence(20, 0);
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_IDS.streakCheck,
    content: {
      title: 'Streak at risk',
      body: "It's been 48+ hours since your last workout. Protect the streak today.",
      sound: true,
      data: { type: 'streak_at_risk' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: CHANNELS.streak,
    },
  });
}

async function scheduleWaterMeal(prefs: NotificationPrefs): Promise<void> {
  if (!prefs.waterMeal.enabled) return;
  const hours = prefs.waterMeal.intervalHours;
  const seconds = Math.max(1, hours) * 60 * 60;

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_IDS.waterMeal,
    content: {
      title: 'Fuel check',
      body: 'Water or a meal — keep the day on track.',
      sound: true,
      data: { type: 'water_meal' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: true,
      channelId: CHANNELS.hydration,
    },
  });
}

/**
 * Cancel athlete local notifications and reschedule from prefs + live data.
 * No-ops scheduling for coaches (cancels athlete locals).
 * Does NOT request permission — caller should request when contextual.
 */
export async function syncNotificationsForUser(
  profile: UserProfile,
  options: { checkStreakNow?: boolean } = {}
): Promise<void> {
  await ensureAndroidChannels();
  await cancelAthleteLocals();

  if (profile.role !== 'athlete') {
    return;
  }

  const permission = await getNotificationPermission();
  if (permission !== 'granted') {
    return;
  }

  const prefs = prefsOf(profile);

  let sessions: Awaited<ReturnType<typeof workouts.getHistory>> = [];
  let exerciseList: Awaited<ReturnType<typeof exercisesApi.getAll>> = [];
  let dayLabel: string | null = null;

  try {
    const [history, allExercises, active] = await Promise.all([
      workouts.getHistory(80),
      exercisesApi.getAll(),
      programs.getActive().catch(() => null),
    ]);
    sessions = history;
    exerciseList = allExercises;
    if (active?.assignment?.active && active.today?.dayLabel) {
      dayLabel = active.today.dayLabel;
    }
  } catch (err) {
    console.warn('Notification sync data load failed', err);
  }

  if (prefs.dailyMotivation.enabled) {
    const tip = selectDailyTip({
      sessions,
      exercises: exerciseList,
      activeDayLabel: dayLabel,
    });
    const backup = pickStaticTip(dateSeed(addDays(new Date(), 1)));
    await scheduleDailyMotivation(prefs, tip.body, backup);
  }

  if (options.checkStreakNow !== false && prefs.streakAtRisk.enabled) {
    await maybeNotifyStreakAtRisk(sessions);
  }

  const streakAlreadyFired = await hasFiredToday('streak');
  const shouldScheduleStreak =
    prefs.streakAtRisk.enabled &&
    sessions.length > 0 &&
    isStreakAtRisk(sessions) &&
    !streakAlreadyFired;
  await scheduleStreakCheck(prefs, shouldScheduleStreak);

  if (prefs.waterMeal.enabled) {
    await scheduleWaterMeal(prefs);
  }
}

export async function cancelAllLocalNotifications(): Promise<void> {
  await cancelAthleteLocals();
}
