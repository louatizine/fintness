import * as SecureStore from 'expo-secure-store';
import type {
  ActiveProgram,
  ActivityLevel,
  Equipment,
  Exercise,
  ExerciseKind,
  ExerciseProgress,
  NutritionDayLog,
  NutritionGoalKind,
  NutritionGoals,
  NutritionMeal,
  NutritionSuggestion,
  Program,
  ProgramDay,
  ProgramType,
  SetLog,
  Sex,
  UserProfile,
  UserProgram,
  WorkoutCalorieSummary,
  WorkoutSession,
} from '../types/models';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL is not set in .env');

const TOKEN_KEY = 'ironlog.jwt';

let token: string | null = null;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export const auth = {
  async register(email: string, password: string) {
    const data = await request<{ token: string; userId: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await this.saveToken(data.token);
    return data;
  },

  async login(email: string, password: string) {
    const data = await request<{ token: string; userId: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await this.saveToken(data.token);
    return data;
  },

  async restoreSession(): Promise<boolean> {
    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    if (stored) { token = stored; return true; }
    return false;
  },

  async logout() {
    token = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },

  async saveToken(t: string) {
    token = t;
    await SecureStore.setItemAsync(TOKEN_KEY, t);
  },
};

// ─── Exercises ──────────────────────────────────────────────────────────────

export const exercises = {
  getAll: () => request<Exercise[]>('/exercises'),
  create: (data: {
    name: string;
    type: ExerciseKind;
    muscleGroup?: string;
    notes?: string;
    metBasis?: string | null;
    equipment?: Equipment;
    targetSets?: number;
    targetRepMin?: number;
    targetRepMax?: number;
  }) => request<Exercise>('/exercises', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Pick<Exercise, 'name' | 'type' | 'muscleGroup' | 'notes' | 'targetSets' | 'targetRepMin' | 'targetRepMax'>>) =>
    request<Exercise>(`/exercises/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: true }>(`/exercises/${id}`, { method: 'DELETE' }),
  setRest: (id: string, restSeconds: number) =>
    request<{ exerciseId: string; restSeconds: number; restOverridden: boolean }>(`/exercises/${id}/rest`, {
      method: 'PATCH',
      body: JSON.stringify({ restSeconds }),
    }),
};

type LoggedSet = Omit<SetLog, 'id' | 'sessionId' | 'completed'>;

export const workouts = {
  log: (session: {
    startedAt?: string;
    notes?: string;
    sets: LoggedSet[];
    userProgramId?: string;
    programId?: string;
    dayIndex?: number;
    dayLabel?: string;
  }) => request<WorkoutSession & { _id: string }>('/workouts', { method: 'POST', body: JSON.stringify(session) }),
  addSet: (sessionId: string, set: LoggedSet) =>
    request<{ sets: SetLog[] }>(`/workouts/${sessionId}/sets`, { method: 'POST', body: JSON.stringify(set) }),
  getHistory: (limit = 50) => request<WorkoutSession[]>(`/workouts?limit=${limit}`),
  getProgress: (exerciseId: string) => request<ExerciseProgress>(`/workouts/progress/${exerciseId}`),
  getSummary: (range: { weekFrom: string; weekTo: string; monthFrom: string; monthTo: string }) =>
    request<WorkoutCalorieSummary>(`/workouts/summary?weekFrom=${encodeURIComponent(range.weekFrom)}&weekTo=${encodeURIComponent(range.weekTo)}&monthFrom=${encodeURIComponent(range.monthFrom)}&monthTo=${encodeURIComponent(range.monthTo)}`),
};

export const programs = {
  getAll: () => request<Program[]>('/programs'),
  getActive: () => request<{ assignment: ActiveProgram['assignment'] | null; program: Program | null; today: ActiveProgram['today'] | null }>('/programs/active'),
  create: (data: { name: string; description?: string; type?: ProgramType; daysPerWeek?: number; days: ProgramDay[] }) =>
    request<Program>('/programs', { method: 'POST', body: JSON.stringify(data) }),
  assign: (programId: string) =>
    request<UserProgram>('/programs/assign', { method: 'POST', body: JSON.stringify({ programId }) }),
  unassign: () => request<{ ok: true }>('/programs/unassign', { method: 'POST' }),
  completeDay: () => request<{ ok: true; currentDayIndex: number }>('/programs/complete-day', { method: 'POST' }),
  skipDay: () => request<{ ok: true; currentDayIndex: number }>('/programs/skip-day', { method: 'POST' }),
};

export const users = {
  getMe: () => request<UserProfile>('/users/me'),
  updateMe: (data: { weightKg: number }) => request<UserProfile>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
};

type NutritionLogUpdate = Pick<NutritionDayLog, 'date' | 'meals' | 'waterMl'>;
type MealInput = Omit<NutritionMeal, '_id' | 'loggedAt'>;

export const nutrition = {
  getGoals: () => request<{ goals: NutritionGoals | null; needsOnboarding: boolean }>('/nutrition/goals'),
  saveGoals: (data: { dailyCalories: number; dailyProtein: number; dailyWater: number; goal: NutritionGoalKind }) =>
    request<{ goals: NutritionGoals; needsOnboarding: false }>('/nutrition/goals', { method: 'POST', body: JSON.stringify(data) }),
  calculate: (data: {
    age: number;
    sex: Sex;
    weightKg: number;
    heightCm: number;
    activityLevel: ActivityLevel;
    goal: NutritionGoalKind;
  }) => request<NutritionSuggestion>('/nutrition/goals/calculate', { method: 'POST', body: JSON.stringify(data) }),
  getLog: (date: string) => request<NutritionDayLog>(`/nutrition/log/${date}`),
  addMeal: (date: string, meal: MealInput) =>
    request<NutritionLogUpdate>('/nutrition/log', { method: 'POST', body: JSON.stringify({ date, meal }) }),
  addWater: (date: string, waterMl: number) =>
    request<NutritionLogUpdate>('/nutrition/log', { method: 'POST', body: JSON.stringify({ date, waterMl }) }),
  deleteMeal: (date: string, mealId: string) =>
    request<NutritionLogUpdate>(`/nutrition/log/${date}/meals/${mealId}`, { method: 'DELETE' }),
};
