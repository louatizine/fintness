export type WeightUnit = 'kg' | 'lb';

export type SetLog = {
  id: string;
  exerciseId: string;
  sessionId: string;
  setNumber: number;
  weight: number;
  reps: number;
  completed: boolean;
  notes?: string;
  completedAt?: string;
};

export type Exercise = {
  id: string;
  userId: string;
  name: string;
  muscleGroup: string;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  restSeconds: number;
  unit: WeightUnit;
  archived: boolean;
};

export type WorkoutDay = {
  id: string;
  userId: string;
  name: string;
  dayOfWeek: number;
  exerciseIds: string[];
  active: boolean;
};

export type WorkoutSession = {
  id: string;
  userId: string;
  workoutDayId: string;
  startedAt: string;
  completedAt?: string;
  totalVolume: number;
  notes?: string;
};

export type PersonalRecord = {
  id: string;
  userId: string;
  exerciseId: string;
  metric: 'weight' | 'reps' | 'volume';
  value: number;
  achievedAt: string;
  sessionId: string;
};

export type UserProfile = {
  id: string;
  email: string;
  weightUnit: WeightUnit;
  createdAt: string;
};

export type WorkoutSummary = {
  workoutsCompleted: number;
  totalVolume: number;
  streak: number;
};