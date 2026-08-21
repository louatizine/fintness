import type { CardioIntensity } from './types.js';

/** Compendium of Physical Activities — representative MET values by intensity. */
export const MET_VALUES: Record<string, Record<CardioIntensity, number>> = {
  running: { low: 7, moderate: 9.8, high: 12.8 },
  cycling: { low: 4, moderate: 8, high: 10 },
  'jump-rope': { low: 8.8, moderate: 11.8, high: 12.3 },
  rowing: { low: 4.8, moderate: 7, high: 8.5 },
  walking: { low: 2.8, moderate: 3.5, high: 4.5 },
  'stair-climber': { low: 4, moderate: 8, high: 9 },
};

export const MET_BASIS_OPTIONS = [
  { seedKey: 'running', name: 'Running' },
  { seedKey: 'cycling', name: 'Cycling' },
  { seedKey: 'jump-rope', name: 'Jump rope' },
  { seedKey: 'rowing', name: 'Rowing' },
  { seedKey: 'walking', name: 'Walking' },
  { seedKey: 'stair-climber', name: 'Stair climber' },
] as const;

export function isMetBasis(value: unknown): value is string {
  return typeof value === 'string' && value in MET_VALUES;
}

export function estimateCaloriesBurned(input: {
  metKey: string | null | undefined;
  intensity: CardioIntensity | null;
  weightKg: number | null;
  durationMin: number;
}): number | null {
  if (!input.metKey || !isMetBasis(input.metKey) || input.weightKg === null || input.weightKg <= 0 || input.durationMin <= 0) {
    return null;
  }
  const intensity = input.intensity ?? 'moderate';
  const met = MET_VALUES[input.metKey][intensity];
  if (!met) return null;
  return Math.round(met * input.weightKg * (input.durationMin / 60));
}
