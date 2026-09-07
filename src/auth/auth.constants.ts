/**
 * US-01 tuning knobs. Read via ConfigService so they can be lowered in tests
 * and raised in production without touching business logic.
 */
export const AUTH_DEFAULTS = {
  /** AC-5: attempts before the account locks. */
  maxFailedAttempts: 15,
  /** AC-5: trailing window in which those attempts must occur, in minutes. */
  failedWindowMinutes: 30,
  /** AC-5: how long the lock lasts once tripped, in minutes. */
  lockoutMinutes: 30,
} as const;

/**
 * AC-2: one message for every credential failure. Never say which field was
 * wrong, and never distinguish "no such account" from "wrong password".
 */
export const INVALID_CREDENTIALS_MESSAGE = 'invalid email or password';

/** AC-5: the locked response must point the user at the helpline. */
export const ACCOUNT_LOCKED_MESSAGE =
  'Account temporarily locked due to repeated failed sign-in attempts. Please contact the IT helpline for assistance.';
