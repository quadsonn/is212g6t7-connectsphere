import axios, { AxiosError } from 'axios';

import type { ApiErrorBody } from '@/types/api';
import { tokenStore } from './token';

/**
 * The single axios instance every request goes through. Base URL is
 * configuration — never hardcode a host.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
});

/** Attaches the bearer token to every outgoing request. */
apiClient.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Mirrors the backend's default-deny: a 401 anywhere means the session is
 * over, so drop the token and let the route guard send the user to /login.
 *
 * 403 is deliberately NOT treated this way — the user is authenticated but
 * lacks the permission, and logging them out would hide that.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.status === 401) {
      tokenStore.clear();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?reason=session-expired');
      }
    }
    return Promise.reject(error);
  },
);

/** Pulls a displayable message out of Nest's error envelope. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    if (!error.response) return 'Cannot reach the server. Is the API running?';
  }
  return fallback;
}
