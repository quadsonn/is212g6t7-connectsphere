import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PrismaClient, RegistrationStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-35 (Story 35) — an Attendee withdraws their registration when permitted,
 * releasing their place. Integration tests, one describe per acceptance
 * criterion.
 *
 * The code under test (RegistrationsController, every route @Roles(ATTENDEE)):
 *  - Every registration view carries `withdrawal`, from evaluateWithdrawal()
 *    in registration-rules.ts: canWithdraw is true only for a REGISTERED
 *    registration before its cutoff (the event's withdrawalCutoffAt, or 24
 *    hours before the start), and the cutoff is always returned so it can be
 *    shown.
 *  - POST /registrations/:id/withdraw -> RegistrationsService.withdraw():
 *    WithdrawDto requires { confirm: true }, so a cancelled prompt (which
 *    sends nothing) changes nothing. loadOwned() refuses another Attendee's
 *    registration (403). Under a row lock on the event it re-reads the status,
 *    re-checks evaluateWithdrawal() (409 with the reason), sets WITHDRAWN and
 *    withdrawnAt, and sends REGISTRATION_WITHDRAWN.
 *  - Places are counted from REGISTERED rows only, so a withdrawal frees its
 *    place at once; registering again re-activates the same row under Story
 *    33's rules.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql, tc-s2-142-setup.sql (two more Attendees,
 * a full event) and tc-s2-151-setup.sql (USR-001's registrations before
 * and after their cutoff, and one already withdrawn)
 * (docs/testing/sprint2-test-cases.md).
 */
describe('Story 35 withdraw my registration (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users: base-users.sql, plus USR-002 from tc-s2-142-setup.sql. */
  const USERS = {
    attendee: 'attendee@example.com',
    attendeeB: 'attendee.b@example.com',
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    tech: 'tech.support@example.com',
    venueStaff: 'venue.staff@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed rows from tc-s2-151-setup.sql and tc-s2-142-setup.sql. */
  const REG = {
    dinner: 'REG-002', // before its cutoff
    late: 'REG-006', // cutoff passed
    left: 'REG-007', // already withdrawn
    bea: 'REG-003', // USR-002's place at the full "Sold Out Talk"
  } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Withdraw, confirmed, as the base Attendee by default. */
  const withdraw = (id: string, body: object = { confirm: true }, who: keyof typeof USERS = 'attendee') =>
    http().post(`/registrations/${id}/withdraw`).set('Authorization', as(who)).send(body);
  const view = (id: string, who: keyof typeof USERS = 'attendee') =>
    http().get(`/registrations/${id}`).set('Authorization', as(who));
  const statusOf = async (id: string) => (await prisma.registration.findUniqueOrThrow({ where: { id } })).status;

  /** Loads a test case's setup script(s) on top of the shared pre-condition. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    await resetDb(prisma);
    await given('base-users', 'tc-s2-142-setup');
    for (const [key, email] of Object.entries(USERS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    // Leave the testDB empty, so files not yet converted to resetDb (which
    // delete only the tables they know) never trip over rows this file made.
    await resetDb(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('base-users', 'tc-s2-142-setup', 'tc-s2-151-setup');
  });

  describe('AC-1: the withdraw option is available on active registrations before the cutoff', () => {
    // TC-S2-151 · US-35 AC-1 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if an active registration before its cutoff didn't offer withdrawal
    // Code: evaluateWithdrawal() gives canWithdraw true for REGISTERED before the cutoff, with the cutoff.
    it('offers withdrawal, showing the cutoff', async () => {
      const res = await view(REG.dinner).expect(200);

      expect(res.body.withdrawal).toEqual({
        canWithdraw: true,
        reason: null,
        withdrawalCutoffAt: '2030-09-30T00:00:00.000Z',
      });
    });

    // TC-S2-151 · US-35 AC-1 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if "My Registrations" didn't say which registrations can be withdrawn
    // Code: findMine() attaches the same withdrawal options to each registration.
    it('marks which registrations in "My Registrations" can be withdrawn', async () => {
      const res = await http().get('/registrations/me').set('Authorization', as('attendee')).expect(200);

      const canWithdraw = Object.fromEntries(
        res.body.registrations.map((r: { id: string; withdrawal: { canWithdraw: boolean } }) => [r.id, r.withdrawal.canWithdraw]),
      );
      expect(canWithdraw).toEqual({ [REG.dinner]: true, [REG.late]: false, [REG.left]: false });
    });
  });

  describe('AC-2: withdrawal requires confirmation; cancelling leaves it unchanged', () => {
    // TC-S2-152 · US-35 AC-2 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if a withdrawal went through without an explicit confirmation
    // Code: WithdrawDto requires confirm to equal true; anything else is 400 before the service runs.
    it.each([
      ['no confirmation (the prompt was cancelled)', {}],
      ['confirm: false', { confirm: false }],
      ['confirm: "yes"', { confirm: 'yes' }],
    ])('refuses %s (400) and leaves the registration as it was', async (_case, body) => {
      const res = await withdraw(REG.dinner, body).expect(400);

      expect(res.body.message).toContain('withdrawal must be confirmed (confirm: true)');
      expect(await statusOf(REG.dinner)).toBe(RegistrationStatus.REGISTERED);
    });
  });

  describe('AC-3: on confirmation, the status changes to Withdrawn', () => {
    // TC-S2-153 · US-35 AC-3 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if a confirmed withdrawal didn't change the status to Withdrawn, record when, or confirm it
    // Code: withdraw() sets WITHDRAWN and withdrawnAt, and sends REGISTRATION_WITHDRAWN.
    it('changes the status to WITHDRAWN and records when', async () => {
      const res = await withdraw(REG.dinner).expect(200);

      expect(res.body).toMatchObject({ id: REG.dinner, status: RegistrationStatus.WITHDRAWN });
      expect(Number.isNaN(Date.parse(res.body.withdrawnAt))).toBe(false);
      expect(await statusOf(REG.dinner)).toBe(RegistrationStatus.WITHDRAWN);
      const [note] = await prisma.notification.findMany({ where: { recipientId: 'USR-001' } });
      expect(note).toMatchObject({
        type: NotificationType.REGISTRATION_WITHDRAWN,
        message: 'Your registration for "Charity Dinner" has been withdrawn.',
      });
    });

    // TC-S2-153 · US-35 AC-3 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if a double-clicked withdrawal ran twice
    // Code: withdraw() locks the event and re-reads the status under the lock, so the second sees WITHDRAWN and gets 409.
    it('lets only one of two simultaneous withdrawals through', async () => {
      const results = await Promise.all([withdraw(REG.dinner), withdraw(REG.dinner)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prisma.notification.count({ where: { recipientId: 'USR-001' } })).toBe(1);
    });
  });

  describe("AC-4: the event's registration count drops by one and the place is free for others", () => {
    // TC-S2-154 · US-35 AC-4 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if a withdrawn place still counted, or another Attendee still couldn't take it
    // Code: places are counted from REGISTERED rows only, so the next count is
    // one lower and Story 33's capacity check lets someone else in.
    it('frees the place at a full event for another Attendee', async () => {
      const options = () =>
        http().get('/registrations/events/EVT-077/options').set('Authorization', as('attendee'));
      expect((await options().expect(200)).body).toMatchObject({ registeredCount: 2, block: 'FULL' });

      await withdraw(REG.bea, { confirm: true }, 'attendeeB').expect(200);

      expect((await options().expect(200)).body).toMatchObject({ registeredCount: 1, canRegister: true });
      await http()
        .post('/registrations')
        .set('Authorization', as('attendee'))
        .send({ eventId: 'EVT-077', phone: '+65 9123 4567' })
        .expect(201);
    });
  });

  describe('AC-5: after the cutoff, withdrawal is unavailable and the cutoff is shown', () => {
    // TC-S2-155 · US-35 AC-5 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if a registration past its cutoff offered withdrawal, or the cutoff wasn't shown
    // Code: at or after the cutoff, evaluateWithdrawal() gives canWithdraw false with the cutoff in the reason.
    it('withholds the option and shows the cutoff', async () => {
      const res = await view(REG.late).expect(200);

      expect(res.body.withdrawal).toEqual({
        canWithdraw: false,
        reason: 'The withdrawal cutoff of 2020-01-01T00:00:00.000Z has passed.',
        withdrawalCutoffAt: '2020-01-01T00:00:00.000Z',
      });
    });

    // TC-S2-155 · US-35 AC-5 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if a withdrawal after the cutoff went through
    // Code: withdraw() re-checks evaluateWithdrawal() and answers 409 with the reason.
    it('refuses a withdrawal after the cutoff (409)', async () => {
      const res = await withdraw(REG.late).expect(409);

      expect(res.body.message).toBe('The withdrawal cutoff of 2020-01-01T00:00:00.000Z has passed.');
      expect(await statusOf(REG.late)).toBe(RegistrationStatus.REGISTERED);
    });
  });

  describe('AC-6: withdrawn registrations have no withdraw option; re-registering follows Story 33', () => {
    // TC-S2-156 · US-35 AC-6 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if a withdrawn registration still offered withdrawal, or could be withdrawn again
    // Code: evaluateWithdrawal() gives canWithdraw false for anything but REGISTERED; withdraw() answers 409.
    it('offers no withdraw option, and refuses withdrawing again (409)', async () => {
      expect((await view(REG.left).expect(200)).body.withdrawal).toMatchObject({
        canWithdraw: false,
        reason: 'This registration has already been withdrawn.',
      });

      await withdraw(REG.left).expect(409);
    });

    // TC-S2-156 · US-35 AC-6, US-33 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if an Attendee couldn't register again after withdrawing, or a duplicate row was created
    // Code: register() re-activates the existing row (one per event and Attendee) under the same rules as a first registration.
    it('lets the Attendee register again, re-activating the same registration', async () => {
      const res = await http()
        .post('/registrations')
        .set('Authorization', as('attendee'))
        // A real number: +65 8000 0000 is not one, so RegisterDto now refuses it.
        .send({ eventId: 'EVT-088', phone: '+65 9123 4567' })
        .expect(201);

      expect(res.body).toMatchObject({ id: REG.left, status: RegistrationStatus.REGISTERED, withdrawnAt: null, phone: '+6591234567' });
      expect(await prisma.registration.count({ where: { eventId: 'EVT-088' } })).toBe(1);
    });
  });

  describe("access: only my own registrations, Attendees only", () => {
    // TC-S2-157 · US-35 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if an Attendee could withdraw someone else's registration
    // Code: loadOwned() answers 403 when the registration isn't the caller's.
    it("refuses to withdraw another Attendee's registration (403)", async () => {
      await withdraw(REG.bea).expect(403);

      expect(await statusOf(REG.bea)).toBe(RegistrationStatus.REGISTERED);
    });

    // TC-S2-157 · US-35 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if a staff member or Organiser could withdraw a registration
    // Code: the route is @Roles(ATTENDEE), so RolesGuard answers 403.
    it.each(['organiser', 'coordinator', 'tech', 'venueStaff'] as const)('refuses %s (403)', async (who) => {
      await withdraw(REG.dinner, { confirm: true }, who).expect(403);
      expect(await statusOf(REG.dinner)).toBe(RegistrationStatus.REGISTERED);
    });

    // TC-S2-157 · US-35 · setup: base-users + tc-s2-142-setup + tc-s2-151-setup · fails if a registration could be withdrawn without logging in
    // Code: JwtAuthGuard answers 401 without a token.
    it('refuses a request without a token (401)', async () => {
      await http().post(`/registrations/${REG.dinner}/withdraw`).send({ confirm: true }).expect(401);
    });
  });
});
