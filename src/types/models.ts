export type WeightUnit = 'kg' | 'lb';
export type ExerciseKind = 'strength' | 'cardio';
export type CardioIntensity = 'low' | 'moderate' | 'high';
export const EQUIPMENT = ['none', 'dumbbell', 'barbell', 'machine', 'bodyweight', 'band', 'kettlebell', 'cable'] as const;
export type Equipment = (typeof EQUIPMENT)[number];
export const PROGRAM_TYPES = ['upper_lower', 'push_pull_legs', 'full_body', 'home_bodyweight', 'custom'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export type SetLog = {
  id?: string;
  exerciseId: string;
  exerciseName?: string;
  sessionId: string;
  kind?: ExerciseKind;
  setNumber: number;
  weight?: number;
  reps?: number;
  durationMin?: number;
  distanceKm?: number | null;
  intensity?: CardioIntensity | null;
  caloriesBurned?: number | null;
  routePoints?: { lat: number; lng: number; timestamp: number }[];
  distanceSource?: 'gps' | 'manual' | null;
  hasRoute?: boolean;
  avgHeartRate?: number | null;
  completed?: boolean;
  notes?: string;
  completedAt?: string;
};

export type Exercise = {
  id: string;
  name: string;
  type: ExerciseKind;
  muscleGroup: string;
  notes?: string;
  targetSets?: number | null;
  targetRepMin?: number | null;
  targetRepMax?: number | null;
  restSeconds: number | null;
  restSuggested?: number | null;
  restOverridden?: boolean;
  unit: WeightUnit;
  equipment: Equipment;
  progressionPath: string[];
  createdBy: string | null;
  isCustom: boolean;
  seedKey?: string | null;
  metBasis?: string | null;
  archived: boolean;
  referenceImageUrl: string | null;
  referenceInstructions: string[];
};

export type ProgramExercise = {
  exerciseId: string;
  exerciseName?: string;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
};

export type ProgramDay = {
  dayLabel: string;
  exercises: ProgramExercise[];
};

export type Program = {
  id: string;
  name: string;
  description: string;
  type: ProgramType;
  daysPerWeek: number;
  createdBy: string | null;
  isCustom: boolean;
  assignedToUserId?: string | null;
  createdByCoachId?: string | null;
  assignedByCoachName?: string | null;
  days: ProgramDay[];
};

export type UserProgram = {
  id: string;
  userId: string;
  programId: string;
  startedAt: string;
  active: boolean;
  currentDayIndex: number;
};

export type BodyweightSuggestion = {
  repMin: number;
  repMax: number;
  note: string;
  progressed: boolean;
  nextVariation: { id: string; name: string } | null;
};

export type ActiveProgramSlot = ProgramExercise & {
  equipment?: Equipment | null;
  suggestion: BodyweightSuggestion | null;
};

export type ActiveProgram = {
  assignment: {
    id: string;
    programId: string;
    startedAt: string;
    currentDayIndex: number;
    active: boolean;
  };
  program: Program;
  today: {
    dayIndex: number;
    dayLabel: string;
    exercises: ActiveProgramSlot[];
  };
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
  _id?: string;
  userId: string;
  workoutDayId?: string;
  userProgramId?: string;
  programId?: string;
  dayIndex?: number;
  dayLabel?: string;
  startedAt: string;
  completedAt?: string;
  endedAt?: string | null;
  durationMin?: number;
  totalVolume: number;
  notes?: string;
  sets?: SetLog[];
  exerciseNames?: string[];
  kinds?: ExerciseKind[];
  cardioDurationMin?: number;
  cardioCaloriesBurned?: number | null;
};

export type StrengthProgressPoint = {
  date: string;
  maxWeight: number;
  maxVolume: number;
  totalVolume: number;
};

export type CardioProgressPoint = {
  date: string;
  durationMin: number;
  distanceKm: number;
  paceMinPerKm: number | null;
  caloriesBurned: number | null;
};

export type ExerciseProgress =
  | { type: 'strength'; points: StrengthProgressPoint[] }
  | { type: 'cardio'; points: CardioProgressPoint[] };

export type UserRole = 'athlete' | 'coach';
export type ContactPreference = 'app' | 'email' | 'phone';
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
  specialties: string[];
  certifications: string;
  contactPreference: ContactPreference;
  email?: string;
  phone?: string;
};

export type DailyMotivationPrefs = {
  enabled: boolean;
  hour: number;
  minute: number;
};

export type WaterMealPrefs = {
  enabled: boolean;
  intervalHours: number;
};

export type NotificationPrefs = {
  dailyMotivation: DailyMotivationPrefs;
  streakAtRisk: { enabled: boolean };
  waterMeal: WaterMealPrefs;
  coachRequestResponse: { enabled: boolean };
  planAssigned: { enabled: boolean };
  coachRequestReceived: { enabled: boolean };
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  dailyMotivation: { enabled: true, hour: 8, minute: 0 },
  streakAtRisk: { enabled: true },
  waterMeal: { enabled: false, intervalHours: 2 },
  coachRequestResponse: { enabled: true },
  planAssigned: { enabled: true },
  coachRequestReceived: { enabled: true },
};

export type UserProfile = {
  id: string;
  email: string;
  weightUnit: WeightUnit;
  weightKg: number | null;
  createdAt: string;
  role: UserRole;
  coachProfile: CoachProfile | null;
  notificationPrefs: NotificationPrefs;
};

export type PublicCoach = {
  id: string;
  displayName: string;
  bio: string;
  specialties: string[];
  certifications: string;
  uniqueViews: number;
  videoCount: number;
};

export type CoachVideo = {
  id: string;
  coachId: string;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  youtubeId: string | null;
  kind: 'youtube' | 'file';
  exerciseTag: string | null;
  viewCount: number;
  uniqueViews: number;
  createdAt: string;
};

export type CoachDetail = PublicCoach & {
  videos: CoachVideo[];
  programs: Program[];
  myRequest: { id: string; status: string; message: string } | null;
};

export type CoachListResponse = {
  page: number;
  limit: number;
  total: number;
  coaches: PublicCoach[];
};

export type CoachRequest = {
  id: string;
  athleteId: string;
  coachId: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: string;
  coachName: string;
  athleteLabel: string;
};

export type CoachContactInfo = {
  method: ContactPreference;
  email: string | null;
  phone: string | null;
};

export type CoachClientSummary = {
  athleteId: string;
  name: string;
  email: string;
  coachingStartedAt: string;
  programName: string | null;
  lastWorkoutAt: string | null;
  plannedSessions: number;
  completedSessions: number;
};

export type CoachClientWorkout = {
  id: string;
  startedAt: string;
  dayLabel: string;
  totalVolume: number;
  exerciseNames: string[];
};

export type CoachClientNutritionDay = {
  date: string;
  calories: number;
  protein: number;
  waterMl: number;
  mealCount: number;
};

export type CoachClientDetail = {
  athleteId: string;
  name: string;
  email: string;
  weightKg: number | null;
  coachingStartedAt: string;
  program: Program | null;
  nutritionGoals: NutritionGoals | null;
  nutritionPlan: NutritionPlan | null;
  recentWorkouts: CoachClientWorkout[];
  recentNutritionLogs: CoachClientNutritionDay[];
  adherence: {
    plannedSessions: number;
    completedSessions: number;
    lastWorkoutAt: string | null;
  };
};

export type CardioPeriodTotal = {
  from: string;
  to: string;
  durationMin: number;
  caloriesBurned: number;
  sessions: number;
};

export type WorkoutCalorieSummary = {
  week: CardioPeriodTotal;
  month: CardioPeriodTotal;
};

export type WorkoutSummary = {
  workoutsCompleted: number;
  totalVolume: number;
  streak: number;
};

export type NutritionGoalKind = 'cut' | 'maintain' | 'bulk';
export type NutritionGoalSource = 'auto' | 'manual' | 'coach';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Sex = 'male' | 'female';

export type NutritionGoals = {
  dailyCalories: number;
  dailyProtein: number;
  dailyWater: number;
  goal: NutritionGoalKind;
  source: NutritionGoalSource;
  setByCoachId?: string | null;
  setByCoachName?: string | null;
  updatedAt: string;
};

export type NutritionPlan = {
  id: string;
  coachId: string;
  coachName: string;
  visibility: 'client' | 'public';
  assignedToUserId: string | null;
  title: string;
  description: string;
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
  dailyWater: number;
  goal: NutritionGoalKind;
  mealPlan: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NutritionPlanInput = {
  title: string;
  description?: string;
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs?: number;
  dailyFat?: number;
  dailyWater: number;
  goal: NutritionGoalKind;
  mealPlan?: string;
  notes?: string;
};

export type NutritionMeal = {
  _id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  loggedAt: string;
};

export type NutritionDayLog = {
  date: string;
  meals: NutritionMeal[];
  waterMl: number;
  createdAt?: string;
  updatedAt?: string;
  goals: NutritionGoals | null;
  nutritionPlan: NutritionPlan | null;
  needsOnboarding: boolean;
};

export type NutritionSuggestion = {
  dailyCalories: number;
  dailyProtein: number;
  dailyWater: number;
  goal: NutritionGoalKind;
  bmr: number;
  tdee: number;
};
