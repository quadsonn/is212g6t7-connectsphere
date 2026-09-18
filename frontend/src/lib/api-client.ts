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

/**
 * Splits a 400 validation response into per-field messages.
 *
 * The API returns a flat array like ["name is required", "proposedStart must
 * be in the future"] and flags EVERY offending field at once (US-03 AC-3), so
 * the form can show each error against its own input rather than dumping a
 * list at the top. Messages that do not start with a known field name fall
 * back to the form-level bucket.
 */
export function fieldErrors(
  error: unknown,
  fields: readonly string[],
): { byField: Record<string, string[]>; general: string[] } {
  const byField: Record<string, string[]> = {};
  const general: string[] = [];

  if (!axios.isAxiosError<ApiErrorBody>(error) || error.response?.status !== 400) {
    return { byField, general };
  }

  const raw = error.response?.data?.message;
  const messages = Array.isArray(raw) ? raw : raw ? [raw] : [];

  for (const message of messages) {
    const field = fields.find((name) => message.startsWith(name));
    if (field) {
      (byField[field] ??= []).push(message);
    } else {
      general.push(message);
    }
  }

  return { byField, general };
}

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
