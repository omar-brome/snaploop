import { api } from './api';
import type { CurrentUser } from '../types';
import { useAuthStore } from '../stores/authStore';
import { connectSocket, disconnectSocket } from './socket';

export async function login(identifier: string, password: string) {
  const { user } = await api.post<{ user: CurrentUser }>('/auth/login', { identifier, password });
  useAuthStore.getState().setUser(user);
  connectSocket();
  return user;
}

export async function register(input: {
  email: string;
  username: string;
  password: string;
  fullName: string;
}) {
  const { user } = await api.post<{ user: CurrentUser }>('/auth/register', input);
  useAuthStore.getState().setUser(user);
  connectSocket();
  return user;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    disconnectSocket();
    useAuthStore.getState().clear();
  }
}

// Called on app boot: restores the session from the refresh cookie.
// Deduped at module level — StrictMode double-mounts (and any stray second
// caller) must not fire two refreshes, since rotation consumes the token.
let bootstrapPromise: Promise<void> | null = null;

export function bootstrapSession(): Promise<void> {
  bootstrapPromise ??= (async () => {
    try {
      const { user } = await api.post<{ user: CurrentUser }>('/auth/refresh');
      useAuthStore.getState().setUser(user);
      connectSocket();
    } catch {
      useAuthStore.getState().clear();
    }
  })();
  return bootstrapPromise;
}

export const forgotPassword = (email: string) => api.post('/auth/forgot-password', { email });
export const resetPassword = (token: string, password: string) =>
  api.post('/auth/reset-password', { token, password });
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { currentPassword, newPassword });
