import type { Exercise, WorkoutSession } from '../types/models';
import { dateSeed, pickStaticTip } from './staticTips';

const MUSCLE_LABELS: Record<string, string> = {
  legs: 'legs',
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  core: 'core',
  arms: 'arms',
  cardio: 'cardio',
};

export type DailyTipContext = {
  sessions: WorkoutSession[];
  exercises: Exercise[];
  activeDayLabel: string | null;
  now?: Date;
};

export type DailyTipResult = {
  body: string;
  kind: 'stale_muscle' | 'recent_pr' | 'program_day' | 'static';
};

function daysBetween(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function lastTrainedByMuscle(
  sessions: WorkoutSession[],
  exercises: Exercise[]
): Map<string, Date> {
  const byId = new Map(exercises.map((e) => [e.id, e.muscleGroup]));
  const last = new Map<string, Date>();

  for (const session of sessions) {
    const when = new Date(session.completedAt || session.endedAt || session.startedAt);
    if (Number.isNaN(when.getTime())) continue;
    const sets = session.sets ?? [];
    const exerciseIds = new Set<string>();
    for (const set of sets) {
      if (set.exerciseId) exerciseIds.add(set.exerciseId);
    }
    // Fallback: match exercise names if sets missing
    if (exerciseIds.size === 0 && session.exerciseNames?.length) {
      for (const name of session.exerciseNames) {
        const match = exercises.find((e) => e.name === name);
        if (match) exerciseIds.add(match.id);
      }
    }
    for (const id of exerciseIds) {
      const group = byId.get(id);
      if (!group || group === 'cardio') continue;
      const prev = last.get(group);
      if (!prev || when > prev) last.set(group, when);
    }
  }
  return last;
}

function findStaleMuscle(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  now: Date
): string | null {
  const last = lastTrainedByMuscle(sessions, exercises);
  const knownGroups = [...new Set(exercises.map((e) => e.muscleGroup).filter((g) => g && g !== 'cardio'))];
  let oldest: { group: string; days: number } | null = null;

  for (const group of knownGroups) {
    const trained = last.get(group);
    const days = trained ? daysBetween(now, trained) : 999;
    if (days < 7) continue;
    if (!oldest || days > oldest.days) oldest = { group, days };
  }
  return oldest?.group ?? null;
}

function hasRecentPr(sessions: WorkoutSession[], now: Date): boolean {
  const cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const historicalMax = new Map<string, number>();
  const recentSessions: WorkoutSession[] = [];

  const ordered = [...sessions].sort((a, b) => {
    const ta = new Date(a.completedAt || a.startedAt).getTime();
    const tb = new Date(b.completedAt || b.startedAt).getTime();
    return ta - tb;
  });

  for (const session of ordered) {
    const when = new Date(session.completedAt || session.endedAt || session.startedAt);
    if (Number.isNaN(when.getTime())) continue;
    if (when >= cutoff) {
      recentSessions.push(session);
      continue;
    }
    for (const set of session.sets ?? []) {
      if (!set.exerciseId || set.kind === 'cardio') continue;
      const w = typeof set.weight === 'number' ? set.weight : 0;
      if (w <= 0) continue;
      const prev = historicalMax.get(set.exerciseId) ?? 0;
      if (w > prev) historicalMax.set(set.exerciseId, w);
    }
  }

  for (const session of recentSessions) {
    for (const set of session.sets ?? []) {
      if (!set.exerciseId || set.kind === 'cardio') continue;
      const w = typeof set.weight === 'number' ? set.weight : 0;
      if (w <= 0) continue;
      const prev = historicalMax.get(set.exerciseId) ?? 0;
      if (w > prev) return true;
    }
  }
  return false;
}

export function selectDailyTip(ctx: DailyTipContext): DailyTipResult {
  const now = ctx.now ?? new Date();

  const stale = findStaleMuscle(ctx.sessions, ctx.exercises, now);
  if (stale) {
    const label = MUSCLE_LABELS[stale] ?? stale;
    return {
      kind: 'stale_muscle',
      body: `It's been a week since ${label} — maybe today's the day?`,
    };
  }

  if (hasRecentPr(ctx.sessions, now)) {
    return {
      kind: 'recent_pr',
      body: 'Nice PR this week! Keep the momentum going.',
    };
  }

  if (ctx.activeDayLabel && ctx.activeDayLabel.trim()) {
    return {
      kind: 'program_day',
      body: `${ctx.activeDayLabel.trim()} is on deck today. Show up.`,
    };
  }

  return {
    kind: 'static',
    body: pickStaticTip(dateSeed(now)),
  };
}
