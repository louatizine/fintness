import axios, { AxiosInstance } from 'axios';
import { env } from '../../config/env';
import type { Exercise, UserProfile, WorkoutDay, WorkoutSession, WorkoutSummary } from '../types/models';

export const atlasConfigured = true;
const client: AxiosInstance = axios.create({ baseURL: env.atlasDataApiUrl, timeout: 10000, headers: { 'Content-Type': 'application/json', 'api-key': env.atlasDataApiKey } });

export function setAccessToken(token: string | null) {
  if (token) client.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete client.defaults.headers.common.Authorization;
}

async function call<T>(action: string, collection: string, filter: Record<string, unknown> = {}, document?: unknown) {
  const response = await client.post<T>(`/action/${action}`, { dataSource: env.atlasDataSource, database: env.atlasDbName, collection, filter, ...(document ? { document } : {}) });
  return response.data;
}

export const mongoApi = {
  getProfile: (userId: string) => call<UserProfile>('findOne', 'users', { _id: userId }),
  async getToday(userId: string) {
    const [days, exercises] = await Promise.all([call<WorkoutDay[]>('find', 'workoutDays', { userId, active: true }), call<Exercise[]>('find', 'exercises', { userId, archived: false })]);
    return { days, exercises };
  },
  createSession: (session: WorkoutSession) => call('insertOne', 'workoutSessions', {}, session),
  createSet: (set: unknown) => call('insertOne', 'setLogs', {}, set),
  getSummary: (userId: string) => call<WorkoutSummary>('summary', 'workoutSessions', { userId }),
};