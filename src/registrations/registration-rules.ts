import { EventStatus } from '@prisma/client';

/**
 * E7 — the registration rules as pure functions, so every acceptance criterion
 * can be unit-tested without a database. RegistrationsService supplies the
 * facts (event, headcount, clock); these decide.
 */

export interface RegistrationEventFacts {
  status: EventStatus;
  registrationEnabled: boolean;
  proposedStart: Date | null;
  expectedAttendance: number | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  withdrawalCutoffAt: Date | null;
}

export type RegisterBlock =
  | 'NOT_OPEN_TO_REGISTRATION'
  | 'NOT_YET_OPEN'
  | 'CLOSED'
  | 'FULL';

export interface RegistrationOptions {
  canRegister: boolean;
  /** Machine-readable cause when canRegister is false. */
  block: RegisterBlock | null;
  /** Human-readable cause when canRegister is false. */
  reason: string | null;
  /** US-34 AC-6: shown instead of the register option outside the window. */
  opensAt: Date | null;
  closesAt: Date | null;
}

/** Default: registration opens this many months before the event starts. */
export const REGISTRATION_OPENS_MONTHS_BEFORE = 2;
/** Default: registration closes this many days before the event starts. */
export const REGISTRATION_CLOSES_DAYS_BEFORE = 3;
/** Default: withdrawals stop this many hours before the event starts. */
export const WITHDRAWAL_CUTOFF_HOURS_BEFORE = 24;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * US-34 AC-6 / US-36 AC-5: the stored times, or, where none was set, defaults
 * counted back from the event's start: registration opens 2 months before,
 * closes 3 days before, and withdrawals stop 24 hours before.
 */
export function resolveWindow(
  event: Pick<
    RegistrationEventFacts,
    | 'proposedStart'
    | 'registrationOpensAt'
    | 'registrationClosesAt'
    | 'withdrawalCutoffAt'
  >,
) {
  const start = event.proposedStart;

  let defaultOpensAt: Date | null = null;
  if (start) {
    defaultOpensAt = new Date(start);
    defaultOpensAt.setUTCMonth(
      defaultOpensAt.getUTCMonth() - REGISTRATION_OPENS_MONTHS_BEFORE,
    );
  }

  return {
    opensAt: event.registrationOpensAt ?? defaultOpensAt,
    closesAt:
      event.registrationClosesAt ??
      (start
        ? new Date(start.getTime() - REGISTRATION_CLOSES_DAYS_BEFORE * DAY_MS)
        : null),
    withdrawalCutoffAt:
      event.withdrawalCutoffAt ??
      (start
        ? new Date(start.getTime() - WITHDRAWAL_CUTOFF_HOURS_BEFORE * HOUR_MS)
        : null),
  };
}

/**
 * US-34 AC-1/AC-6/AC-7 — may an attendee register right now? Checked in the
 * order an attendee would want it explained: is it open to registration at
 * all, is the window open, is there room.
 *
 * `registeredCount` counts REGISTERED rows only, so a withdrawal (US-36 AC-4)
 * frees its place with no further bookkeeping.
 */
export function evaluateRegistration(
  event: RegistrationEventFacts,
  registeredCount: number,
  now: Date,
): RegistrationOptions {
  const { opensAt, closesAt } = resolveWindow(event);
  const blocked = (
    block: RegisterBlock,
    reason: string,
  ): RegistrationOptions => ({
    canRegister: false,
    block,
    reason,
    opensAt,
    closesAt,
  });

  // AC-1: only confirmed events with registration enabled.
  if (event.status !== EventStatus.CONFIRMED || !event.registrationEnabled) {
    return blocked(
      'NOT_OPEN_TO_REGISTRATION',
      'Registration is not available for this event.',
    );
  }

  if (opensAt && now < opensAt) {
    return blocked(
      'NOT_YET_OPEN',
      `Registration opens at ${opensAt.toISOString()}` +
        (closesAt ? ` and closes at ${closesAt.toISOString()}.` : '.'),
    );
  }

  if (closesAt && now >= closesAt) {
    const opened = opensAt ? `opened at ${opensAt.toISOString()} and ` : '';
    return blocked(
      'CLOSED',
      `Registration is closed. It ${opened}closed at ${closesAt.toISOString()}.`,
    );
  }

  // AC-7: capacity. A null headcount means no limit was recorded.
  if (
    event.expectedAttendance !== null &&
    registeredCount >= event.expectedAttendance
  ) {
    return blocked('FULL', 'This event is full.');
  }

  return { canRegister: true, block: null, reason: null, opensAt, closesAt };
}

export interface WithdrawOptions {
  canWithdraw: boolean;
  reason: string | null;
  /** US-36 AC-5: always returned so the cutoff can be shown. */
  withdrawalCutoffAt: Date | null;
}

/** US-36 AC-1/AC-5/AC-6 — may this registration be withdrawn right now? */
export function evaluateWithdrawal(
  registrationStatus: 'REGISTERED' | 'WITHDRAWN',
  event: Pick<
    RegistrationEventFacts,
    | 'proposedStart'
    | 'registrationOpensAt'
    | 'registrationClosesAt'
    | 'withdrawalCutoffAt'
  >,
  now: Date,
): WithdrawOptions {
  const { withdrawalCutoffAt } = resolveWindow(event);

  // AC-6: a withdrawn registration has nothing to withdraw.
  if (registrationStatus !== 'REGISTERED') {
    return {
      canWithdraw: false,
      reason: 'This registration has already been withdrawn.',
      withdrawalCutoffAt,
    };
  }

  if (withdrawalCutoffAt && now >= withdrawalCutoffAt) {
    return {
      canWithdraw: false,
      reason: `The withdrawal cutoff of ${withdrawalCutoffAt.toISOString()} has passed.`,
      withdrawalCutoffAt,
    };
  }

  return { canWithdraw: true, reason: null, withdrawalCutoffAt };
}
