export type NutritionGoalKind = 'cut' | 'maintain' | 'bulk';
export type ExerciseKind = 'strength' | 'cardio';
export type CardioIntensity = 'low' | 'moderate' | 'high';

export const EQUIPMENT = ['none', 'dumbbell', 'barbell', 'machine', 'bodyweight', 'band', 'kettlebell', 'cable'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const PROGRAM_TYPES = ['upper_lower', 'push_pull_legs', 'full_body', 'home_bodyweight', 'custom'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];
