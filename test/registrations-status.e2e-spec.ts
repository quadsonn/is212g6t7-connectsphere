import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-34 (Story 34) — an Attendee views the status of their registrations.
 * Integration tests, one describe per acceptance criterion.
 *
 * The code under test (RegistrationsController, every route @Roles(ATTENDEE),
 * Cache-Control: no-store):
 *  - GET /registrations/me -> RegistrationsService.findMine(): the caller's
 *    registrations, by event start. Each is read with its event through the
 *    relation on every call (REGISTRATION_VIEW_SELECT), so the event name,
 *    times and venue (its first APPROVED booking) are always the current ones.
 *    With none, the message "No Events Registered".
 *  - GET /registrations/:id -> findOne(): one registration; loadOwned()
 *    answers 404 if it doesn't exist and 403 if it is another Attendee's.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql, base-venues.sql and tc-s2-142-setup.sql
 * (two more Attendees, with registrations of their own); most tests then load
 * tc-s2-145-setup.sql, USR-001's own registrations
 * (docs/testing/sprint2-test-cases.md).
 */
describe('Story 34 view my registration status (integration)', () => {
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

  /** Fixed rows from tc-s2-145-setup.sql and tc-s2-142-setup.sql. */
  const REG = { concert: 'REG-001', workshop: 'REG-008', bea: 'REG-003' } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const mine = (who: keyof typeof USERS = 'attendee') => http().get('/registrations/me').set('Authorization', as(who));
  const one = (id: string, who: keyof typeof USERS = 'attendee') =>
    http().get(`/registrations/${id}`).set('Authorization', as(who));
  const withdraw = (id: string) =>
    http().post(`/registrations/${id}/withdraw`).set('Authorization', as('attendee')).send({ confirm: true });

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
    await given('base-users', 'base-venues', 'tc-s2-142-setup');
  });

  describe('AC-1: each registration with event name, date/time, venue and status', () => {
    // TC-S2-145 · US-34 AC-1 · setup: base-users + base-venues + tc-s2-142-setup + tc-s2-145-setup · fails if a registration was missing, or lacked its event name, times, venue or status
    // Code: findMine() returns every registration of the caller, active ones
    // first and withdrawn ones below them, soonest event first within each
    // group, each with event { name, start, end, venue } and its status.
    it('lists both registrations with their details and status', async () => {
      await given('tc-s2-145-setup');

      const res = await mine().expect(200);

      expect(res.body.message).toBeNull();
      expect(res.body.registrations).toEqual([
        expect.objectContaining({
          id: REG.concert,
          status: 'REGISTERED',
          event: expect.objectContaining({
            name: 'Autumn Concert',
            start: '2030-10-01T18:00:00.000Z',
            end: '2030-10-01T21:00:00.000Z',
            venue: { id: 'VEN-002', name: 'Main Hall', location: 'Block A, Level 1' },
          }),
        }),
        expect.objectContaining({
          id: REG.workshop,
          status: 'WITHDRAWN',
          withdrawnAt: '2026-09-10T09:00:00.000Z',
          event: expect.objectContaining({
            name: 'Pottery Workshop',
            start: '2030-09-15T09:00:00.000Z',
            end: '2030-09-15T12:00:00.000Z',
            venue: null,
          }),
        }),
      ]);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('US-34: a registration whose event is cancelled stays listed, with nothing left to do', () => {
    // The state a cancellation leaves behind (US-43/US-44): the event is
    // CANCELLED and its approved booking RELEASED. The registration itself is
    // untouched, so it is still REGISTERED.
    const cancelConcert = async () => {
      await prisma.eventRequest.update({ where: { id: 'EVT-062' }, data: { status: 'CANCELLED' } });
      await prisma.venueBooking.update({ where: { id: 'BKG-056' }, data: { status: 'RELEASED' } });
    };

    it('US-34: the cancelled registration is still listed, marked cancelled, with withdrawal off', async () => {
      await given('tc-s2-145-setup');
      await cancelConcert();

      const res = await mine().expect(200);

      expect(res.body.registrations).toContainEqual(
        expect.objectContaining({
          id: REG.concert,
          status: 'REGISTERED',
          event: expect.objectContaining({ name: 'Autumn Concert', status: 'CANCELLED', venue: null }),
          withdrawal: expect.objectContaining({
            canWithdraw: false,
            reason: 'This event has been cancelled.',
          }),
        }),
      );
    });

    it('US-34: the server refuses to withdraw a registration on a cancelled event (409), changing nothing', async () => {
      await given('tc-s2-145-setup');
      await cancelConcert();

      const res = await withdraw(REG.concert).expect(409);

      expect(res.body.message).toBe('This event has been cancelled.');
      const row = await prisma.registration.findUniqueOrThrow({ where: { id: REG.concert } });
      expect(row).toMatchObject({ status: 'REGISTERED', withdrawnAt: null });
      expect(
        await prisma.notification.count({ where: { recipientId: 'USR-001', type: 'REGISTRATION_WITHDRAWN' } }),
      ).toBe(0);
    });

    it('US-34: a confirmed event still works normally: venue shown, and withdrawal allowed', async () => {
      await given('tc-s2-145-setup');

      const listed = (await mine().expect(200)).body.registrations.find(
        (r: { id: string }) => r.id === REG.concert,
      );
      expect(listed).toMatchObject({
        event: { status: 'CONFIRMED', venue: { id: 'VEN-002', name: 'Main Hall' } },
        withdrawal: { canWithdraw: true, reason: null },
      });

      const res = await withdraw(REG.concert).expect(200);
      expect(res.body.status).toBe('WITHDRAWN');
    });
  });

  describe('AC-2: event details are always the current ones', () => {
    // TC-S2-146 · US-34 AC-2 · setup: base-users + base-venues + tc-s2-142-setup + tc-s2-145-setup · fails if the list showed event details as they were at registration instead of now
    // Code: REGISTRATION_VIEW_SELECT reads the event through the relation on
    // every call; nothing is copied onto the registration.
    it('shows a renamed, retimed event as it is now', async () => {
      await given('tc-s2-145-setup');
      await prisma.eventRequest.update({
        where: { id: 'EVT-062' },
        data: {
          name: 'Autumn Concert (moved)',
          proposedStart: new Date('2030-10-02T18:00:00.000Z'),
          proposedEnd: new Date('2030-10-02T21:00:00.000Z'),
        },
      });

      const concert = (await mine().expect(200)).body.registrations.find((r: { id: string }) => r.id === REG.concert);

      expect(concert.event).toMatchObject({
        name: 'Autumn Concert (moved)',
        start: '2030-10-02T18:00:00.000Z',
        end: '2030-10-02T21:00:00.000Z',
      });
    });

    // TC-S2-146 · US-34 AC-2 · setup: base-users + base-venues + tc-s2-142-setup + tc-s2-145-setup · fails if a venue confirmed after registering didn't appear
    // Code: the venue is the event's first APPROVED booking, looked up on every call.
    it('shows a venue once its booking is approved', async () => {
      await given('tc-s2-145-setup');
      await prisma.venueBooking.create({
        data: {
          eventId: 'EVT-132',
          venueId: 'VEN-038',
          start: new Date('2030-09-15T09:00:00.000Z'),
          end: new Date('2030-09-15T12:00:00.000Z'),
          status: 'APPROVED',
        },
      });

      const res = await one(REG.workshop).expect(200);

      expect(res.body.event.venue).toEqual({ id: 'VEN-038', name: 'Seminar Room', location: 'Block B, Level 3' });
    });
  });

  describe('AC-3: "No Events Registered" when there are none', () => {
    // TC-S2-147 · US-34 AC-3 · setup: base-users + base-venues + tc-s2-142-setup · fails if an Attendee with no registrations got an empty list without the message
    // Code: findMine() sets message to NO_REGISTRATIONS_MESSAGE when the list is empty.
    it('says "No Events Registered"', async () => {
      const res = await mine().expect(200);

      expect(res.body).toEqual({ registrations: [], message: 'No Events Registered' });
    });
  });

  describe("AC-4: only my own registrations; another Attendee's is denied", () => {
    // TC-S2-148 · US-34 AC-4 · setup: base-users + base-venues + tc-s2-142-setup + tc-s2-145-setup · fails if my list included another Attendee's registrations
    // Code: findMine() filters by attendeeId = the caller.
    it("never lists another Attendee's registrations", async () => {
      await given('tc-s2-145-setup');

      const ids = (await mine().expect(200)).body.registrations.map((r: { id: string }) => r.id);

      expect(ids.sort()).toEqual([REG.concert, REG.workshop].sort());
    });

    // TC-S2-148 · US-34 AC-4 · setup: base-users + base-venues + tc-s2-142-setup · fails if an Attendee could open another Attendee's registration
    // Code: loadOwned() answers 403 when the registration's attendeeId isn't the caller.
    it("denies opening another Attendee's registration (403)", async () => {
      const res = await one(REG.bea).expect(403);

      expect(res.body.message).toBe('you can only view your own registrations');
    });

    // TC-S2-148 · US-34 AC-4 · setup: base-users + base-venues + tc-s2-142-setup + tc-s2-145-setup · fails if an Attendee couldn't open their own registration
    // Code: loadOwned() returns the caller's own registration.
    it('opens my own registration', async () => {
      await given('tc-s2-145-setup');

      expect((await one(REG.concert).expect(200)).body).toMatchObject({ id: REG.concert, status: 'REGISTERED' });
    });

    // TC-S2-148 · US-34 AC-4 · setup: base-users + base-venues + tc-s2-142-setup · fails if an unknown registration id returned anything but 404
    // Code: loadOwned() answers 404 when no registration has that id.
    it('reports an unknown registration as not found (404)', async () => {
      await one('does-not-exist').expect(404);
    });
  });

  describe('access: Attendees only', () => {
    // TC-S2-149 · US-34 · setup: base-users + base-venues + tc-s2-142-setup · fails if a staff member or Organiser could read registrations through these routes
    // Code: the routes are @Roles(ATTENDEE), so RolesGuard answers 403.
    it.each(['organiser', 'coordinator', 'tech', 'venueStaff'] as const)('refuses %s (403)', async (who) => {
      await mine(who).expect(403);
      await one(REG.bea, who).expect(403);
    });

    // TC-S2-149 · US-34 · setup: base-users + base-venues + tc-s2-142-setup · fails if registrations were readable without logging in
    // Code: JwtAuthGuard answers 401 without a token.
    it('refuses a request without a token (401)', async () => {
      await http().get('/registrations/me').expect(401);
    });
  });
});
