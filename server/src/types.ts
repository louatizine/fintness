export type NutritionGoalKind = 'cut' | 'maintain' | 'bulk';
export type ExerciseKind = 'strength' | 'cardio';
export type CardioIntensity = 'low' | 'moderate' | 'high';

export const EQUIPMENT = ['none', 'dumbbell', 'barbell', 'machine', 'bodyweight', 'band', 'kettlebell', 'cable'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const PROGRAM_TYPES = ['upper_lower', 'push_pull_legs', 'full_body', 'home_bodyweight', 'custom'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const USER_ROLES = ['athlete', 'coach'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CONTACT_PREFERENCES = ['app', 'email', 'phone'] as const;
export type ContactPreference = (typeof CONTACT_PREFERENCES)[number];

export const COACH_SPECIALTIES = [
  'strength',
  'hypertrophy',
  'powerlifting',
  'olympic',
  'calisthenics',
  'cardio',
  'mobility',
  'nutrition',
  'sports',
  'rehab',
] as const;
export type CoachSpecialty = (typeof COACH_SPECIALTIES)[number];

export const VIDEO_REPORT_REASONS = ['spam', 'inappropriate', 'misleading', 'other'] as const;
export type VideoReportReason = (typeof VIDEO_REPORT_REASONS)[number];

export type CoachProfile = {
  displayName: string;
  bio: string;
  specialties: CoachSpecialty[];
  certifications: string;
  contactPreference: ContactPreference;
  email: string;
  phone: string;
};
