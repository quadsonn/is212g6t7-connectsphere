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
 * The API's validation messages are written for developers (e.g. "name is
 * required", "expectedAttendance must be greater than zero") since they also
 * back the e2e test suite. This maps the exact, known messages to
 * user-friendly copy for display; anything unmapped falls back to a
 * capitalised version of the raw message so the UI never regresses to a
 * blank or garbled string.
 */
const MESSAGE_OVERRIDES: Record<string, string> = {
  'name is required': 'Please enter an event name.',
  'purpose is required': 'Please describe the purpose of this event.',
  'description is required': 'Please provide a description for this event.',
  'category is required': 'Please select or enter a category.',
  'proposedStart must be a valid ISO 8601 date': 'Please enter a valid start date and time.',
  'proposedStart must be in the future': 'The start date and time must be in the future.',
  'proposedEnd must be a valid ISO 8601 date': 'Please enter a valid end date and time.',
  'proposedEnd must be later than proposedStart': 'The end time must be after the start time.',
  'expectedAttendance must be a whole number': 'Expected attendance must be a whole number.',
  'expectedAttendance must be greater than zero': 'Expected attendance must be greater than zero.',
  // US-21 — venue booking requests.
  'start must be a valid ISO 8601 date': 'Please enter a valid date and start time.',
  'start must be in the future': 'The booking must start in the future.',
  'end must be a valid ISO 8601 date': 'Please enter a valid end time.',
  'end must be later than start': 'The end time must be after the start time.',
  'venueId is required': 'Please choose a venue.',
  'the requested time overlaps a confirmed booking for this venue':
    'This venue is already booked for part of that time.',
  // US-23 — booking decisions.
  'a reason is required to reject this booking request': 'Please give a reason for rejecting this request.',
  'a reason is required to reverse this decision': 'Please give a reason for reversing this decision.',
  'another confirmed booking already holds part of this time':
    'Another confirmed booking already holds part of this time, so this one cannot be approved.',
  // US-16 — blocked-out periods.
  'the requested time falls in a period blocked out for this venue':
    'This venue is blocked out for part of that time.',
  'this time falls in a period blocked out for this venue':
    'This time is blocked out for the venue, so the request cannot be approved.',
  'a reason is required to block out time': 'Please give a reason for blocking out this time.',
};

/** Turns a camelCase field name into a human label, e.g. "proposedStart" → "start". */
const FIELD_LABELS: Record<string, string> = {
  name: 'name',
  purpose: 'purpose',
  description: 'description',
  category: 'category',
  proposedStart: 'start date and time',
  proposedEnd: 'end date and time',
  expectedAttendance: 'expected attendance',
  preferredLayout: 'preferred layout',
  layoutNotes: 'layout notes',
  accessibilityRequirements: 'accessibility requirements',
  accessibilityNotes: 'accessibility notes',
  equipmentNeeds: 'equipment needs',
  email: 'email',
  password: 'password',
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function capitalise(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * class-validator's default @IsString() failure ("name must be a string") is
 * a raw type-check message that should never reach a user — it fires only
 * when a field arrives as the wrong JSON type, not from anything a form UI
 * would normally produce. Reworded generically here rather than per-DTO so
 * it is caught everywhere, not just on the event request form.
 */
const MUST_BE_A_STRING = /^(\w+) must be a string$/;

function friendlyMessage(message: string): string {
  if (MESSAGE_OVERRIDES[message]) return MESSAGE_OVERRIDES[message];

  const stringMatch = message.match(MUST_BE_A_STRING);
  if (stringMatch) {
    return `Please enter a valid ${fieldLabel(stringMatch[1])}.`;
  }

  if (message.startsWith('preferredLayout must be one of')) {
    return 'Please select a valid layout option.';
  }
  if (message.startsWith('accessibilityRequirements must contain only')) {
    return 'Please select valid accessibility options.';
  }
  return capitalise(message);
}

/**
 * Splits a 400 validation response into per-field messages.
 *
 * The API returns a flat array like ["name is required", "proposedStart must
 * be in the future"] and flags EVERY offending field at once (US-03 AC-3), so
 * the form can show each error against its own input rather than dumping a
 * list at the top. Field matching runs against the raw API message (so it
 * stays correct regardless of display wording); the message shown to the
 * user is passed through friendlyMessage first. Messages that do not start
 * with a known field name fall back to the form-level bucket.
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
    const display = friendlyMessage(message);
    if (field) {
      (byField[field] ??= []).push(display);
    } else {
      general.push(display);
    }
  }

  return { byField, general };
}

/** Pulls a displayable message out of Nest's error envelope. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.map(friendlyMessage).join(' ');
    if (typeof message === 'string') return friendlyMessage(message);
    if (!error.response) return 'Cannot reach the server. Please check your connection and try again.';
  }
  return fallback;
}
