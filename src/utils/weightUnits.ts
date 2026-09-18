import type { WeightUnit } from '../types/models';

const LB_PER_KG = 2.2046226218;

export function kgToDisplay(weightKg: number, unit: WeightUnit): number {
  return unit === 'lb' ? weightKg * LB_PER_KG : weightKg;
}

export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value / LB_PER_KG : value;
}

export function formatWeightInput(weightKg: number | null, unit: WeightUnit): string {
  if (weightKg == null) return '';
  const display = kgToDisplay(weightKg, unit);
  const rounded = unit === 'lb' ? Math.round(display * 10) / 10 : Math.round(display * 10) / 10;
  return String(rounded);
}
