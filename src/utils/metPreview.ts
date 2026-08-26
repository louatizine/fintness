import type { CardioIntensity } from '../types/models';

/** Client copy of server MET tables — preview only; server remains source of truth. */
const MET_VALUES: Record<string, Record<CardioIntensity, number>> = {
  running: { low: 7, moderate: 9.8, high: 12.8 },
  cycling: { low: 4, moderate: 8, high: 10 },
  'jump-rope': { low: 8.8, moderate: 11.8, high: 12.3 },
  rowing: { low: 4.8, moderate: 7, high: 8.5 },
  walking: { low: 2.8, moderate: 3.5, high: 4.5 },
  'stair-climber': { low: 4, moderate: 8, high: 9 },
};

export function previewCaloriesBurned(input: {
  seedKey?: string | null;
  intensity: CardioIntensity | null;
  weightKg: number | null;
  durationMin: number;
}): number | null {
  const key = input.seedKey && input.seedKey in MET_VALUES ? input.seedKey : null;
  if (!key || input.weightKg === null || input.weightKg <= 0 || input.durationMin <= 0) return null;
  const met = MET_VALUES[key][input.intensity ?? 'moderate'];
  if (!met) return null;
  return Math.round(met * input.weightKg * (input.durationMin / 60));
}

export function isGpsTrackable(seedKey?: string | null) {
  return seedKey === 'running' || seedKey === 'cycling';
}
