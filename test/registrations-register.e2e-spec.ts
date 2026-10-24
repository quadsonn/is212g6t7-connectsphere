import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PrismaClient, RegistrationStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-33 (Story 33) — an Attendee registers for an event and provides the
 * required information. Integration tests, one describe per acceptance
 * criterion. (Stories 34 and 35, viewing and withdrawing, follow in their own
 * files.)
 *
 * The code under test (RegistrationsController, every route @Roles(ATTENDEE)):
 *  - GET /registrations/events/:eventId/options -> RegistrationsService.getOptions():
 *    whether the Register option applies, and if not, why, with the open and
 *    close times. The rules are evaluateRegistration() in registration-rules.ts,
 *    in this order: CONFIRMED with registration enabled (AC-1), inside the
 *    open/close window (AC-6), not full (AC-7). It also says whether the
 *    caller is already registered (AC-5).
 *  - POST /registrations -> register(): RegisterDto validates the form (phone
 *    required, international with its country code, stored as E.164;
 *    accessibility optional; dietary requirements are no longer asked) (AC-2).
 *    Under a row lock on the event, it refuses a second active registration
 *    (AC-4/AC-5) and re-checks evaluateRegistration(), answering 409 with the
 *    reason; otherwise it saves a REGISTERED row and
 *    sends a REGISTRATION_CONFIRMED notification (AC-3).
 *  - Events an Attendee can't see at all (e.g. DRAFT) read as 404.
 *
 * The windows use fixed dates far from today (open since 2026, closing in
 * 2030; or closed in 2020; or opening in 2030), so no clock is frozen.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and tc-s2-136-setup.sql (a confirmed event
 * open for registration); some tests then load a further tc-s2 script, as
 * their test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 33 register for an event (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users: base-users.sql, plus USR-002/c from tc-s2-142-setup.sql. */
  const USERS = {
    attendee: 'attendee@example.com',
    attendeeC: 'attendee.c@example.com',
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    tech: 'tech.support@example.com',
    venueStaff: 'venue.staff@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed events from tc-s2-136/137/143-setup.sql. */
  const EVENT = {
    gala: 'EVT-078',
    disabled: 'EVT-109',
    planning: 'EVT-112',
    draft: 'EVT-110',
    notOpen: 'EVT-111',
    closed: 'EVT-108',
    full: 'EVT-077',
    lastPlace: 'EVT-085',
  } as const;

  /** A complete, valid registration form. */
  const FORM = { phone: '+65 9123 4567', accessibilityNeeds: 'Aisle seat' };

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Register for an event, as the base Attendee by default. */
  const register = (eventId: string, body: Record<string, unknown> = FORM, who: keyof typeof USERS = 'attendee') =>
    http().post('/registrations').set('Authorization', as(who)).send({ eventId, ...body });

  const options = (eventId: string, who: keyof typeof USERS = 'attendee') =>
    http().get(`/registrations/events/${eventId}/options`).set('Authorization', as(who));

  const registrationsOn = (eventId: string) => prisma.registration.findMany({ where: { eventId } });

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
    await given('base-users', 'tc-s2-136-setup');
  });

  describe('AC-1: the Register option is only for confirmed events with registration enabled', () => {
    // TC-S2-136 · US-33 AC-1 · setup: base-users + tc-s2-136-setup · fails if a confirmed event open for registration didn't offer the Register option
    // Code: evaluateRegistration() passes every rule, so canRegister is true; the window is returned too.
    it('offers it for a confirmed event with registration enabled', async () => {
      const res = await options(EVENT.gala).expect(200);

      expect(res.body).toMatchObject({
        eventId: EVENT.gala,
        canRegister: true,
        block: null,
        reason: null,
        alreadyRegistered: false,
        registeredCount: 0,
        capacity: 100,
        opensAt: '2026-01-01T00:00:00.000Z',
        closesAt: '2030-09-28T00:00:00.000Z',
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    // TC-S2-137 · US-33 AC-1 · setup: base-users + tc-s2-136-setup + tc-s2-137-setup · fails if the Register option showed, or registering worked, for an event with registration off
    // Code: evaluateRegistration() blocks NOT_OPEN_TO_REGISTRATION unless CONFIRMED and registrationEnabled; register() re-checks and answers 409.
    it('withholds it for an event with registration disabled, and refuses to register (409)', async () => {
      await given('tc-s2-137-setup');

      expect((await options(EVENT.disabled).expect(200)).body).toMatchObject({
        canRegister: false,
        block: 'NOT_OPEN_TO_REGISTRATION',
      });
      const res = await register(EVENT.disabled).expect(409);
      expect(res.body.message).toBe('Registration is not available for this event.');
      expect(await registrationsOn(EVENT.disabled)).toEqual([]);
    });

    // TC-S2-137 · US-33 AC-1 · setup: base-users + tc-s2-136-setup + tc-s2-137-setup · fails if an Attendee could see or register for an event not yet confirmed
    // Code: findVisibleEvent() only finds ATTENDEE_VISIBLE_STATUSES; a planning event reads as 404.
    it('treats an event not yet confirmed (planning) as not found (404)', async () => {
      await given('tc-s2-137-setup');

      await options(EVENT.planning).expect(404);
      await register(EVENT.planning).expect(404);
      expect(await registrationsOn(EVENT.planning)).toEqual([]);
    });

    // TC-S2-137 · US-33 AC-1 · setup: base-users + tc-s2-136-setup + tc-s2-137-setup · fails if an Attendee could see or register for a draft event
    // Code: findVisibleEvent() only finds ATTENDEE_VISIBLE_STATUSES; a draft reads as 404.
    it('treats a draft event as not found (404)', async () => {
      await given('tc-s2-137-setup');

      await options(EVENT.draft).expect(404);
      await register(EVENT.draft).expect(404);
    });
  });

  describe('AC-2: required fields are captured; missing or invalid ones block submission', () => {
    // TC-S2-138 · US-33 AC-2 · setup: base-users + tc-s2-136-setup · fails if a registration without a valid phone number went through, or a field wasn't named
    // Code: RegisterDto trims the phone, then requires it and checks its format; each failure is a 400 naming the field.
    it.each([
      ['a missing phone', { accessibilityNeeds: 'None' }, 'phone is required'],
      ['a phone made only of spaces', { phone: '   ' }, 'phone is required'],
      ['an invalid phone', { phone: 'call me' }, 'phone must start with + and the country code, and use only digits and spaces'],
    ])('flags %s (400) and saves nothing', async (_case, body, message) => {
      const res = await register(EVENT.gala, body).expect(400);

      expect(res.body.message).toContain(message);
      expect(await registrationsOn(EVENT.gala)).toEqual([]);
    });

    // TC-S2-138 · US-33 AC-2 · setup: base-users + tc-s2-136-setup · fails if registering for no event were accepted
    // Code: RegisterDto requires eventId.
    it('flags a missing event (400)', async () => {
      await http().post('/registrations').set('Authorization', as('attendee')).send(FORM).expect(400);
    });

    // TC-S2-138 · US-33 AC-2 · setup: base-users + tc-s2-136-setup · fails if the optional fields were required, or the phone wasn't stored trimmed
    // Code: accessibility notes are @IsOptional; the phone is trimmed, then stored as E.164 (toE164).
    it('accepts a phone alone, stored trimmed in international format', async () => {
      await register(EVENT.gala, { phone: '  +65 9123 4567  ' }).expect(201);

      expect((await registrationsOn(EVENT.gala))[0]).toMatchObject({
        phone: '+6591234567',
        dietaryRequirements: null,
        accessibilityNeeds: null,
      });
    });
  });

  describe('AC-3: a successful registration is saved as Registered, with a confirmation', () => {
    // TC-S2-139 · US-33 AC-3 · setup: base-users + tc-s2-136-setup · fails if the registration wasn't saved as Registered with its details, or no confirmation was produced
    // Code: register() saves a REGISTERED row, returns it with the event, and sends REGISTRATION_CONFIRMED to the Attendee.
    it('saves the registration as REGISTERED and confirms it', async () => {
      const res = await register(EVENT.gala).expect(201);

      expect(res.body).toMatchObject({
        status: RegistrationStatus.REGISTERED,
        phone: '+6591234567',
        accessibilityNeeds: 'Aisle seat',
        withdrawnAt: null,
        event: { id: EVENT.gala, name: 'Spring Gala' },
      });
      expect(await registrationsOn(EVENT.gala)).toEqual([
        expect.objectContaining({ attendeeId: 'USR-001', status: RegistrationStatus.REGISTERED }),
      ]);
      const [note] = await prisma.notification.findMany({ where: { recipientId: 'USR-001' } });
      expect(note).toMatchObject({
        type: NotificationType.REGISTRATION_CONFIRMED,
        relatedEventId: EVENT.gala,
        message: 'You are registered for "Spring Gala".',
      });
    });
  });

  describe('AC-4/AC-5: one active registration per event, and no second attempt once confirmed', () => {
    // TC-S2-140 · US-33 AC-4, AC-5 · setup: base-users + tc-s2-136-setup · fails if an Attendee could register twice for the same event, or still saw the Register option
    // Code: register() finds the caller's REGISTERED row and answers 409; getOptions() sets alreadyRegistered and hides the option.
    it('refuses a second registration and withdraws the Register option', async () => {
      await register(EVENT.gala).expect(201);

      const again = await register(EVENT.gala).expect(409);

      expect(again.body.message).toBe('You are already registered for this event.');
      expect((await options(EVENT.gala).expect(200)).body).toMatchObject({
        canRegister: false,
        alreadyRegistered: true,
        reason: 'You are already registered for this event.',
        registeredCount: 1,
      });
      expect(await registrationsOn(EVENT.gala)).toHaveLength(1);
    });

    // TC-S2-140 · US-33 AC-4 · setup: base-users + tc-s2-136-setup · fails if a double-submitted form created two registrations
    // Code: register() locks the event row, so the second request sees the first registration and gets 409.
    it('lets only one of two simultaneous submissions through', async () => {
      const results = await Promise.all([register(EVENT.gala), register(EVENT.gala)]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await registrationsOn(EVENT.gala)).toHaveLength(1);
    });
  });

  describe("AC-6: registration only between the event's open and close times", () => {
    // TC-S2-141 · US-33 AC-6 · setup: base-users + tc-s2-136-setup + tc-s2-137-setup · fails if registering worked before the window opened, or the open/close times weren't shown
    // Code: before opensAt, evaluateRegistration() blocks NOT_YET_OPEN with both times in the reason.
    it('refuses before it opens, showing the open and close times', async () => {
      await given('tc-s2-137-setup');

      expect((await options(EVENT.notOpen).expect(200)).body).toMatchObject({
        canRegister: false,
        block: 'NOT_YET_OPEN',
        opensAt: '2030-01-01T00:00:00.000Z',
        closesAt: '2030-09-28T00:00:00.000Z',
      });
      const res = await register(EVENT.notOpen).expect(409);
      expect(res.body.message).toBe('Registration opens at 2030-01-01T00:00:00.000Z and closes at 2030-09-28T00:00:00.000Z.');
    });

    // TC-S2-141 · US-33 AC-6 · setup: base-users + tc-s2-136-setup + tc-s2-137-setup · fails if registering worked after the window closed, or the times weren't shown
    // Code: at or after closesAt, evaluateRegistration() blocks CLOSED with both times in the reason.
    it('refuses after it closes, showing the open and close times', async () => {
      await given('tc-s2-137-setup');

      expect((await options(EVENT.closed).expect(200)).body).toMatchObject({ canRegister: false, block: 'CLOSED' });
      const res = await register(EVENT.closed).expect(409);
      expect(res.body.message).toBe(
        'Registration is closed. It opened at 2019-01-01T00:00:00.000Z and closed at 2020-01-01T00:00:00.000Z.',
      );
      expect(await registrationsOn(EVENT.closed)).toEqual([]);
    });
  });

  describe('AC-7: a full event rejects the registration with a "full" message', () => {
    // TC-S2-142 · US-33 AC-7 · setup: base-users + tc-s2-136-setup + tc-s2-142-setup · fails if an Attendee could register for an event at capacity, or wasn't told it was full
    // Code: when REGISTERED rows reach expectedAttendance, evaluateRegistration() blocks FULL ("This event is full.").
    it('refuses with "This event is full."', async () => {
      await given('tc-s2-142-setup');

      expect((await options(EVENT.full).expect(200)).body).toMatchObject({
        canRegister: false,
        block: 'FULL',
        registeredCount: 2,
        capacity: 2,
      });
      const res = await register(EVENT.full).expect(409);
      expect(res.body.message).toBe('This event is full.');
      expect(await registrationsOn(EVENT.full)).toHaveLength(2);
    });

    // TC-S2-142 · US-33 AC-7 · setup: base-users + tc-s2-136-setup + tc-s2-142-setup · fails if two Attendees could both take the last place
    // Code: register() locks the event row and counts under the lock, so the second request sees the event full.
    it('gives the last place to exactly one of two simultaneous Attendees', async () => {
      await given('tc-s2-142-setup');

      const results = await Promise.all([
        register(EVENT.lastPlace, FORM, 'attendee'),
        register(EVENT.lastPlace, FORM, 'attendeeC'),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)?.body.message).toBe('This event is full.');
      expect(await registrationsOn(EVENT.lastPlace)).toHaveLength(2);
    });
  });

  describe('access: Attendees only', () => {
    // TC-S2-143 · US-33 · setup: base-users + tc-s2-136-setup · fails if a staff member or Organiser could register for an event
    // Code: every registration route is @Roles(ATTENDEE), so RolesGuard answers 403.
    it.each(['organiser', 'coordinator', 'tech', 'venueStaff'] as const)('refuses %s (403)', async (who) => {
      await register(EVENT.gala, FORM, who).expect(403);
      await options(EVENT.gala, who).expect(403);
      expect(await registrationsOn(EVENT.gala)).toEqual([]);
    });

    // TC-S2-143 · US-33 · setup: base-users + tc-s2-136-setup · fails if registering worked without logging in
    // Code: JwtAuthGuard answers 401 without a token.
    it('refuses a request without a token (401)', async () => {
      await http().post('/registrations').send({ eventId: EVENT.gala, ...FORM }).expect(401);
    });
  });
});
