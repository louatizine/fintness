import type { NutritionGoalKind } from './types.js';

export type LastSet = { reps?: number | null; sessionId?: string; completedAt?: string };

export type BodyweightSuggestion = {
  repMin: number;
  repMax: number;
  note: string;
  progressed: boolean;
  nextVariation: { id: string; name: string } | null;
};

const GOAL_RANGES: Record<NutritionGoalKind, { min: number; max: number }> = {
  cut: { min: 15, max: 20 },
  bulk: { min: 8, max: 12 },
  maintain: { min: 10, max: 15 },
};

function lastSessionSets(logs: LastSet[]): LastSet[] {
  if (logs.length === 0) return [];
  const latest = [...logs].sort((a, b) => String(b.completedAt ?? '').localeCompare(String(a.completedAt ?? '')))[0];
  if (!latest?.sessionId) {
    return Number(latest?.reps) > 0 ? [latest] : [];
  }
  return logs.filter((log) => log.sessionId === latest.sessionId);
}

export function suggestBodyweightReps(input: {
  goal?: NutritionGoalKind | null;
  lastLogs?: LastSet[];
  progressionPath?: string[];
  exerciseId: string;
  variationNames?: Map<string, string>;
}): BodyweightSuggestion {
  const goal = input.goal ?? 'maintain';
  const base = GOAL_RANGES[goal];
  const lastSets = lastSessionSets(input.lastLogs ?? []);
  const hitTop = lastSets.length > 0 && lastSets.every((set) => (Number(set.reps) || 0) >= base.max);
  const path = input.progressionPath ?? [];
  const index = path.indexOf(input.exerciseId);
  const nextId = hitTop && index >= 0 && index < path.length - 1 ? path[index + 1] : null;
  const nextName = nextId ? input.variationNames?.get(nextId) ?? null : null;
  const nextVariation = nextId && nextName ? { id: nextId, name: nextName } : nextId ? { id: nextId, name: 'harder variation' } : null;

  if (hitTop) {
    const repMin = base.min + 2;
    const repMax = base.max + 3;
    const note = nextVariation
      ? `Last time you hit ${base.max}+ on every set. Try ${repMin}–${repMax} reps, or switch to ${nextVariation.name}.`
      : `Last time you hit ${base.max}+ on every set. Try ${repMin}–${repMax} next, or slow the tempo.`;
    return { repMin, repMax, note, progressed: true, nextVariation };
  }

  const note =
    goal === 'cut'
      ? 'Higher-rep endurance range for a cut — override if you need fewer quality reps.'
      : goal === 'bulk'
        ? '8–12 for bodyweight strength. Add pause/tempo or a harder variation if this feels easy.'
        : '10–15 to maintain. Override freely.';

  return { repMin: base.min, repMax: base.max, note, progressed: false, nextVariation: null };
}
