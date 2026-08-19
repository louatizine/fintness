import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { env } from '../../config/env';
import { setAccessToken } from './mongoApi';

const tokenKey = 'fintness.session-token';
const authClient = axios.create({ baseURL: `https://realm.mongodb.com/api/client/v2.0/app/${env.atlasAppId}`, timeout: 10000, headers: { 'Content-Type': 'application/json' } });
type AuthResponse = { access_token: string; refresh_token?: string; user_id?: string };
type AuthProvider = 'local-userpass' | string;

async function persistSession(response: AuthResponse) { await SecureStore.setItemAsync(tokenKey, response.access_token); setAccessToken(response.access_token); return response; }

export const authApi = {
  async login(email: string, password: string) { const response = await authClient.post<AuthResponse>('/auth/providers/local-userpass/login', { username: email, password }); return persistSession(response.data); },
  async register(email: string, password: string) { await authClient.post('/auth/providers/local-userpass/register', { email, password }); return this.login(email, password); },
  async loginWithProvider(provider: AuthProvider) { throw new Error(`Le fournisseur ${provider} n'est pas encore implemente.`); },
  async restoreSession() { const token = await SecureStore.getItemAsync(tokenKey); if (token) setAccessToken(token); return token; },
  async logout() { await SecureStore.deleteItemAsync(tokenKey); setAccessToken(null); },
};