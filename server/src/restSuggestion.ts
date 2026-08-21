import type { NutritionGoalKind } from './types.js';

export type ExerciseKind = 'strength' | 'cardio';

export function suggestRestSeconds(input: {
  type: ExerciseKind;
  targetRepMin?: number;
  targetRepMax?: number;
  goal?: NutritionGoalKind | null;
}): number | null {
  if (input.type === 'cardio') return null;
  const min = input.targetRepMin ?? 8;
  const max = input.targetRepMax ?? 12;
  const mid = (min + max) / 2;
  const band = mid <= 6 ? 'low' : mid <= 8 ? 'moderate' : 'high';
  const goal = input.goal ?? 'maintain';
  const table = {
    low: { cut: 120, maintain: 150, bulk: 180 },
    moderate: { cut: 90, maintain: 105, bulk: 120 },
    high: { cut: 60, maintain: 75, bulk: 90 },
  } as const;
  return table[band][goal];
}
