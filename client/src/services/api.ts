import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import type { ApiEnvelope, ApiMeta } from '../types';
import { useAuthStore } from '../stores/authStore';

// Single axios instance. Cookies carry the tokens; on a 401 we try one
// silent refresh and replay the original request. Concurrent 401s share the
// same refresh promise so the rotation isn't raced.

export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshPromise ??= axios
    .post('/api/auth/refresh', null, { withCredentials: true })
    .then((res) => {
      const user = res.data?.data?.user;
      if (user) useAuthStore.getState().setUser(user);
      return true;
    })
    .catch(() => {
      useAuthStore.getState().clear();
      return false;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';
    if (status === 401 && original && !original._retried && !url.includes('/auth/')) {
      original._retried = true;
      if (await tryRefresh()) return http(original);
    }
    return Promise.reject(error);
  }
);

// Unwrapped helpers — return `data`, throw Error(message) on failure.
export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const envelope = err.response?.data as ApiEnvelope<unknown> | undefined;
    return envelope?.error?.message ?? err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}

async function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  try {
    const res = await promise;
    return res.data.data;
  } catch (err) {
    throw new Error(apiErrorMessage(err));
  }
}

async function unwrapPage<T>(
  promise: Promise<{ data: ApiEnvelope<T[]> }>
): Promise<{ data: T[]; meta: ApiMeta | null }> {
  try {
    const res = await promise;
    return { data: res.data.data, meta: res.data.meta };
  } catch (err) {
    throw new Error(apiErrorMessage(err));
  }
}

export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) => unwrap<T>(http.get(url, config)),
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(http.post(url, body, config)),
  patch: <T>(url: string, body?: unknown) => unwrap<T>(http.patch(url, body)),
  delete: <T>(url: string) => unwrap<T>(http.delete(url)),
  // For paginated endpoints: returns { data, meta } for useInfiniteQuery.
  page: <T>(url: string, params?: Record<string, unknown>) =>
    unwrapPage<T>(http.get(url, { params })),
};
