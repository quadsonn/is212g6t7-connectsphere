import { EventStatus } from '@prisma/client';

import {
  evaluateRegistration,
  evaluateWithdrawal,
  RegistrationEventFacts,
} from './registration-rules';

/** US-33 and US-35 — the registration rules, with no database involved. */
describe('registration rules', () => {
  const start = new Date('2030-10-10T09:00:00.000Z');
  const now = new Date('2030-10-01T09:00:00.000Z');

  const event = (
    overrides: Partial<RegistrationEventFacts> = {},
  ): RegistrationEventFacts => ({
    status: EventStatus.CONFIRMED,
    registrationEnabled: true,
    proposedStart: start,
    expectedAttendance: 10,
    registrationOpensAt: null,
    registrationClosesAt: null,
    withdrawalCutoffAt: null,
    ...overrides,
  });

  describe('evaluateRegistration', () => {
    it('US-33 AC-1: allows a confirmed event with registration enabled', () => {
      const result = evaluateRegistration(event(), 0, now);
      expect(result.canRegister).toBe(true);
      expect(result.reason).toBeNull();
    });

    it.each(
      Object.values(EventStatus).filter((s) => s !== EventStatus.CONFIRMED),
    )('US-33 AC-1: refuses a %s event', (status) => {
      const result = evaluateRegistration(event({ status }), 0, now);
      expect(result.canRegister).toBe(false);
      expect(result.block).toBe('NOT_OPEN_TO_REGISTRATION');
    });

    it('US-33 AC-1: refuses a confirmed event with registration disabled', () => {
      const result = evaluateRegistration(
        event({ registrationEnabled: false }),
        0,
        now,
      );
      expect(result.block).toBe('NOT_OPEN_TO_REGISTRATION');
    });

    it('US-33 AC-6: before the opening time, shows the open and close times', () => {
      const opens = new Date('2030-10-05T00:00:00.000Z');
      const closes = new Date('2030-10-08T00:00:00.000Z');
      const result = evaluateRegistration(
        event({ registrationOpensAt: opens, registrationClosesAt: closes }),
        0,
        now,
      );

      expect(result.canRegister).toBe(false);
      expect(result.block).toBe('NOT_YET_OPEN');
      expect(result.opensAt).toEqual(opens);
      expect(result.closesAt).toEqual(closes);
      expect(result.reason).toContain(opens.toISOString());
      expect(result.reason).toContain(closes.toISOString());
    });

    it('US-33 AC-6: at or after the closing time, shows the times', () => {
      const closes = new Date('2030-09-30T00:00:00.000Z');
      const result = evaluateRegistration(
        event({ registrationClosesAt: closes }),
        0,
        now,
      );

      expect(result.block).toBe('CLOSED');
      expect(result.reason).toContain(closes.toISOString());
      expect(
        evaluateRegistration(event({ registrationClosesAt: now }), 0, now)
          .block,
      ).toBe('CLOSED');
    });

    it('US-33 AC-6: with no closing time set, registration closes 3 days before the start', () => {
      const closes = new Date('2030-10-07T09:00:00.000Z');
      const at = evaluateRegistration(event(), 0, closes);
      expect(at.block).toBe('CLOSED');
      expect(at.closesAt).toEqual(closes);
      expect(
        evaluateRegistration(event(), 0, new Date(closes.getTime() - 1))
          .canRegister,
      ).toBe(true);
    });

    it('US-33 AC-6: with no opening time set, registration opens 2 months before the start', () => {
      const opens = new Date('2030-08-10T09:00:00.000Z');
      const before = evaluateRegistration(
        event(),
        0,
        new Date(opens.getTime() - 1),
      );
      expect(before.block).toBe('NOT_YET_OPEN');
      expect(before.opensAt).toEqual(opens);
      expect(evaluateRegistration(event(), 0, opens).canRegister).toBe(true);
    });

    it('US-33 AC-7: rejects with a "full" message at capacity', () => {
      const result = evaluateRegistration(event(), 10, now);
      expect(result.canRegister).toBe(false);
      expect(result.block).toBe('FULL');
      expect(result.reason).toMatch(/full/i);
    });

    it('US-33 AC-7: still allows the last remaining place', () => {
      expect(evaluateRegistration(event(), 9, now).canRegister).toBe(true);
    });

    it('treats a missing headcount as no limit', () => {
      expect(
        evaluateRegistration(event({ expectedAttendance: null }), 500, now)
          .canRegister,
      ).toBe(true);
    });
  });

  describe('evaluateWithdrawal', () => {
    it('US-35 AC-1: allows withdrawing an active registration before the cutoff', () => {
      const result = evaluateWithdrawal('REGISTERED', event(), now);
      expect(result.canWithdraw).toBe(true);
      expect(result.withdrawalCutoffAt).toEqual(
        new Date('2030-10-09T09:00:00.000Z'),
      );
    });

    it('US-35 AC-5: after the cutoff, refuses and shows the cutoff', () => {
      const cutoff = new Date('2030-09-30T00:00:00.000Z');
      const result = evaluateWithdrawal(
        'REGISTERED',
        event({ withdrawalCutoffAt: cutoff }),
        now,
      );

      expect(result.canWithdraw).toBe(false);
      expect(result.withdrawalCutoffAt).toEqual(cutoff);
      expect(result.reason).toContain(cutoff.toISOString());
    });

    it('US-35 AC-5: with no cutoff set, withdrawals stop 24 hours before the start', () => {
      const cutoff = new Date('2030-10-09T09:00:00.000Z');
      expect(evaluateWithdrawal('REGISTERED', event(), cutoff).canWithdraw).toBe(
        false,
      );
      expect(
        evaluateWithdrawal('REGISTERED', event(), new Date(cutoff.getTime() - 1))
          .canWithdraw,
      ).toBe(true);
    });

    it('US-35 AC-6: a withdrawn registration cannot be withdrawn again', () => {
      const result = evaluateWithdrawal('WITHDRAWN', event(), now);
      expect(result.canWithdraw).toBe(false);
      expect(result.reason).toMatch(/already been withdrawn/i);
    });
  });
});
