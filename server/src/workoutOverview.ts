import type { Db } from 'mongodb';
import { addDateKey, localDateKey } from './localDate.js';

export type OverviewSessionRow = {
  sessionId: string;
  date: string;
  completedAt: string;
  dayLabel?: string;
  volume: number;
};

export type OverviewStreakDay = {
  date: string;
  sessionIds: string[];
  mode: 'program' | 'free';
};

export type WorkoutOverview = {
  workoutsCompleted: number;
  totalVolume: number;
  streak: number;
  streakMode: 'program' | 'free';
  computedAt: string;
  recentExerciseId: string | null;
  breakdown: {
    sessions: OverviewSessionRow[];
    streakDays: OverviewStreakDay[];
  };
};

type AssignmentDoc = {
  startedAt?: unknown;
  endedAt?: unknown;
  active?: unknown;
};

type SessionDoc = {
  _id: { toHexString(): string };
  completedAt?: unknown;
  dayLabel?: unknown;
};

type SetDoc = {
  sessionId?: unknown;
  exerciseId?: unknown;
  kind?: unknown;
  weight?: unknown;
  reps?: unknown;
  completedAt?: unknown;
};

type EventDoc = {
  kind?: unknown;
  at?: unknown;
};

function hasCompletedAt(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function modeOnDate(
  dateKey: string,
  assignments: AssignmentDoc[],
  timeZone: string
): 'program' | 'free' {
  for (const assignment of assignments) {
    if (typeof assignment.startedAt !== 'string') continue;
    const start = localDateKey(assignment.startedAt, timeZone);
    if (!start || start > dateKey) continue;
    if (assignment.active === true && !assignment.endedAt) return 'program';
    if (typeof assignment.endedAt === 'string') {
      const end = localDateKey(assignment.endedAt, timeZone);
      if (end && dateKey <= end) return 'program';
    } else if (assignment.active === true) {
      return 'program';
    }
  }
  return 'free';
}

/**
 * Program-aware streak with free-mode calendar fallback.
 *
 * - Program day (assignment covers local date): empty days do NOT break (implicit rest).
 *   A skip event on that local date breaks. Completed sessions increment.
 * - Free day: calendar-consecutive; empty day breaks.
 * - Today grace: if today is empty under free rules, start from yesterday when yesterday qualifies.
 * - Program switch: contiguous program assignment windows stay in program mode — switch does not reset.
 */
export function computeStreak(opts: {
  timeZone: string;
  now?: Date;
  completedByDate: Map<string, string[]>;
  skipDates: Set<string>;
  assignments: AssignmentDoc[];
}): { streak: number; streakMode: 'program' | 'free'; streakDays: OverviewStreakDay[] } {
  const now = opts.now ?? new Date();
  const today = localDateKey(now, opts.timeZone);
  const yesterday = addDateKey(today, -1);
  const modeToday = modeOnDate(today, opts.assignments, opts.timeZone);

  let cursor = today;
  if (modeToday === 'free' && !opts.completedByDate.has(today)) {
    if (opts.completedByDate.has(yesterday)) cursor = yesterday;
    else return { streak: 0, streakMode: 'free', streakDays: [] };
  }
  if (modeToday === 'program' && opts.skipDates.has(today)) {
    return { streak: 0, streakMode: 'program', streakDays: [] };
  }

  const streakDays: OverviewStreakDay[] = [];
  let guard = 0;
  while (guard < 4000) {
    guard += 1;
    const mode = modeOnDate(cursor, opts.assignments, opts.timeZone);
    if (mode === 'program') {
      if (opts.skipDates.has(cursor)) break;
      const sessionIds = opts.completedByDate.get(cursor);
      if (sessionIds?.length) {
        streakDays.push({ date: cursor, sessionIds, mode });
      }
      // empty program day = scheduled rest / between training slots — keep walking
    } else {
      const sessionIds = opts.completedByDate.get(cursor);
      if (!sessionIds?.length) break;
      streakDays.push({ date: cursor, sessionIds, mode });
    }
    cursor = addDateKey(cursor, -1);
  }

  return {
    streak: streakDays.length,
    streakMode: modeToday,
    streakDays,
  };
}

export async function buildWorkoutOverview(db: Db, userId: string, timeZone: string): Promise<WorkoutOverview> {
  const computedAt = new Date().toISOString();
  const [sessions, assignments, skipEvents, recentSet] = await Promise.all([
    db.collection('workoutSessions').find({
      userId,
      completedAt: { $type: 'string', $ne: '' },
    }).project({ completedAt: 1, dayLabel: 1 }).toArray() as Promise<SessionDoc[]>,
    db.collection('userPrograms').find({ userId }).project({ startedAt: 1, endedAt: 1, active: 1 }).toArray() as Promise<AssignmentDoc[]>,
    db.collection('programDayEvents').find({ userId, kind: 'skip' }).project({ at: 1, kind: 1 }).toArray() as Promise<EventDoc[]>,
    db.collection('setLogs').find({ userId }).sort({ completedAt: -1 }).limit(1).project({ exerciseId: 1 }).toArray() as Promise<SetDoc[]>,
  ]);

  const sessionIds = sessions.map((session) => session._id.toHexString());
  const setLogs = sessionIds.length === 0
    ? []
    : await db.collection('setLogs').find({ sessionId: { $in: sessionIds } }).project({
      sessionId: 1,
      kind: 1,
      weight: 1,
      reps: 1,
    }).toArray() as SetDoc[];

  const volumeBySession = new Map<string, number>();
  for (const set of setLogs) {
    const sessionId = typeof set.sessionId === 'string' ? set.sessionId : '';
    if (!sessionId || set.kind === 'cardio') continue;
    const volume = (Number(set.weight) || 0) * (Number(set.reps) || 0);
    volumeBySession.set(sessionId, (volumeBySession.get(sessionId) ?? 0) + volume);
  }

  const completedByDate = new Map<string, string[]>();
  const breakdownSessions: OverviewSessionRow[] = [];
  let totalVolume = 0;

  for (const session of sessions) {
    if (!hasCompletedAt(session.completedAt)) continue;
    const sessionId = session._id.toHexString();
    const date = localDateKey(session.completedAt, timeZone);
    if (!date) continue;
    const volume = volumeBySession.get(sessionId) ?? 0;
    totalVolume += volume;
    const list = completedByDate.get(date) ?? [];
    list.push(sessionId);
    completedByDate.set(date, list);
    breakdownSessions.push({
      sessionId,
      date,
      completedAt: session.completedAt,
      dayLabel: typeof session.dayLabel === 'string' ? session.dayLabel : undefined,
      volume,
    });
  }

  breakdownSessions.sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  const skipDates = new Set<string>();
  for (const event of skipEvents) {
    if (typeof event.at !== 'string') continue;
    const date = localDateKey(event.at, timeZone);
    if (date) skipDates.add(date);
  }

  const { streak, streakMode, streakDays } = computeStreak({
    timeZone,
    completedByDate,
    skipDates,
    assignments,
  });

  const recentExerciseId = typeof recentSet[0]?.exerciseId === 'string' ? recentSet[0].exerciseId : null;

  return {
    workoutsCompleted: breakdownSessions.length,
    totalVolume,
    streak,
    streakMode,
    computedAt,
    recentExerciseId,
    breakdown: {
      sessions: breakdownSessions,
      streakDays,
    },
  };
}
