import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, RegistrationStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

const DAY = 24 * 60 * 60 * 1000;
/** The frozen "now" the setup scripts' dates are fixed against. */
const NOW = new Date('2030-03-01T00:00:00.000Z');

/**
 * Register only while registration is open and places remain (e2e) — the
 * period and capacity rules, enforced by the server on a direct API call.
 * Story 46 (US-46); the form, browse and "my registrations" tests are Story
 * 33/34 behaviour, kept here.
 *
 * Code under test: RegistrationsService.register (registration-rules.ts
 * evaluateRegistration / resolveWindow, a row lock on the event for the
 * capacity race) and GET /registrations/events/:id/options.
 *
 * The clock is frozen at NOW (Date only; real timers keep running) before the
 * users log in, so the setup scripts' fixed dates are "relative" to it.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * tc-s3-99-setup.sql (Attendees a1-a8); each test loads tc-s3-99b-setup.sql
 * (the events) or a browse-list script.
 */
describe('Registration period and capacity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const attendeeKeys = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** One of tc-s3-99b-setup's events (loads the script). */
  const seedEvent = async (id: string) => {
    await given('tc-s3-99b-setup');
    return { id };
  };

  const register = (who: string, eventId: string) =>
    http()
      .post('/registrations')
      .set('Authorization', as(who))
      .send({ eventId, phone: '+6590000001' });

  const withdraw = (who: string, registrationId: string) =>
    http()
      .post(`/registrations/${registrationId}/withdraw`)
      .set('Authorization', as(who))
      .send({ confirm: true });

  const options = (who: string, eventId: string) =>
    http().get(`/registrations/events/${eventId}/options`).set('Authorization', as(who));

  const activeCount = (eventId: string) =>
    prisma.registration.count({
      where: { eventId, status: RegistrationStatus.REGISTERED },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'hrtime', 'performance'],
    });
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    // Logged in at the frozen NOW, so the tokens are valid for the whole file.
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s3-99-setup');
    for (const key of attendeeKeys) {
      const res = await http().post('/auth/login').send({ email: `${key}@example.com`, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    jest.useRealTimers();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s3-99-setup');
  });

  describe('the registration period', () => {
    // TC-S3-99, TC-S3-104 · US-46 AC-1/AC-6 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if a registration before the window opens is accepted, or the times are not shown
    // Code: RegistrationsService.register -> evaluateRegistration (now < opensAt)
    it('rejects a registration submitted before registration opens, and shows the times', async () => {
      const opens = new Date(Date.now() + 2 * DAY);
      const closes = new Date(Date.now() + 9 * DAY);
      const event = await seedEvent('EVT-217'); // opens in 2 days, closes in 9

      const res = await register('a1', event.id).expect(409);

      expect(res.body.message).toContain(opens.toISOString());
      expect(res.body.message).toContain(closes.toISOString());
      expect(await activeCount(event.id)).toBe(0);

      const view = await options('a1', event.id).expect(200);
      expect(view.body).toMatchObject({
        canRegister: false,
        block: 'NOT_YET_OPEN',
        opensAt: opens.toISOString(),
        closesAt: closes.toISOString(),
      });
    });

    // TC-S3-99, TC-S3-104 · US-46 AC-1/AC-6 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if a registration after the window closes is accepted, or the times are not shown
    // Code: RegistrationsService.register -> evaluateRegistration (now > closesAt)
    it('rejects a registration submitted after registration closes, and shows the times', async () => {
      const opens = new Date(Date.now() - 9 * DAY);
      const closes = new Date(Date.now() - 1000);
      const event = await seedEvent('EVT-218'); // opened 9 days ago, closed 1 second ago

      const res = await register('a1', event.id).expect(409);

      expect(res.body.message).toContain(opens.toISOString());
      expect(res.body.message).toContain(closes.toISOString());
      expect(await activeCount(event.id)).toBe(0);

      const view = await options('a1', event.id).expect(200);
      expect(view.body).toMatchObject({ canRegister: false, block: 'CLOSED' });
    });

    // TC-S3-100 · US-46 AC-2 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if a registration inside the window is refused
    // Code: RegistrationsService.register -> evaluateRegistration
    it('accepts a registration inside the period', async () => {
      const event = await seedEvent('EVT-219'); // opened yesterday, closes tomorrow

      await register('a1', event.id).expect(201);

      expect(await activeCount(event.id)).toBe(1);
    });

    // TC-S3-100 · US-46 AC-2 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if a registration at exactly the closing time is refused
    // Code: RegistrationsService.register -> evaluateRegistration (closesAt itself is allowed)
    it('accepts a registration submitted exactly at the closing time', async () => {
      const event = await seedEvent('EVT-228'); // closes exactly at NOW

      await register('a1', event.id).expect(201);

      expect(await activeCount(event.id)).toBe(1);
    });

    // TC-S3-104 · US-46 AC-6 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if the API accepts a registration the event does not allow
    // Code: RegistrationsService.register -> evaluateRegistration (registrationEnabled)
    it('rejects a direct API call for an event that does not allow registration at all', async () => {
      const closedToRegistration = await seedEvent('EVT-220'); // registration not enabled

      await register('a1', closedToRegistration.id).expect(409);
      expect(await activeCount(closedToRegistration.id)).toBe(0);
    });
  });

  describe('capacity', () => {
    // TC-S3-101, TC-S3-104 · US-46 AC-3/AC-6 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if a full event accepts another registration, or says nothing about being full
    // Code: RegistrationsService.register -> evaluateRegistration (registeredCount >= capacity)
    it('rejects with a "full" message once active registrations equal the capacity', async () => {
      const event = await seedEvent('EVT-221'); // 2 places
      await register('a1', event.id).expect(201);
      await register('a2', event.id).expect(201);

      const res = await register('a3', event.id).expect(409);

      expect(res.body.message).toMatch(/full/i);
      expect(await activeCount(event.id)).toBe(2);

      const view = await options('a3', event.id).expect(200);
      expect(view.body).toMatchObject({
        canRegister: false,
        block: 'FULL',
        registeredCount: 2,
        capacity: 2,
      });
    });

    // TC-S3-102 · US-46 AC-4 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if a withdrawn registration still takes a place
    // Code: RegistrationsService.register -> evaluateRegistration counts REGISTERED only
    it('does not count a withdrawn registration, so its place can be taken', async () => {
      const event = await seedEvent('EVT-222'); // 1 place
      const first = await register('a1', event.id).expect(201);
      await register('a2', event.id).expect(409);

      await withdraw('a1', first.body.id).expect(200);
      expect(await activeCount(event.id)).toBe(0);

      await register('a2', event.id).expect(201);
      expect(await activeCount(event.id)).toBe(1);
    });

    // TC-S3-102, TC-S3-101 · US-46 AC-4/AC-3 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if a withdrawn Attendee can re-register into a full event
    // Code: RegistrationsService.register -> evaluateRegistration
    it('lets a withdrawn Attendee register again only while a place remains', async () => {
      const event = await seedEvent('EVT-222'); // 1 place
      const first = await register('a1', event.id).expect(201);
      await withdraw('a1', first.body.id).expect(200);
      await register('a2', event.id).expect(201);

      const res = await register('a1', event.id).expect(409);

      expect(res.body.message).toMatch(/full/i);
    });

    // TC-S3-106 · US-46 AC-8 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if a refused registration is kept as a waiting-list entry
    // Code: RegistrationsService.register -> evaluateRegistration
    it('has no waiting list: a full event simply rejects', async () => {
      const event = await seedEvent('EVT-222'); // 1 place
      await register('a1', event.id).expect(201);

      await register('a2', event.id).expect(409);

      const waiting = await prisma.registration.count({ where: { eventId: event.id } });
      expect(waiting).toBe(1);
    });
  });

  describe('the registration form', () => {
    const submit = (who: string, eventId: string, extra: Record<string, unknown>) =>
      http()
        .post('/registrations')
        .set('Authorization', as(who))
        .send({ eventId, phone: '+65 9123 4567', ...extra });

    // Story 33 (registration form), kept · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup
    it.each([
      ['+65 9123 4567', '+6591234567'],
      ['+44 20 7946 0958', '+442079460958'],
      ['+1 (415) 555-2671', '+14155552671'],
      ['+91 98765 43210', '+919876543210'],
    ])('accepts the international number %p and stores it as %p', async (phone, stored) => {
      const event = await seedEvent('EVT-224');

      const res = await submit('a1', event.id, { phone }).expect(201);

      expect(res.body.phone).toBe(stored);
    });

    // Story 33 (registration form), kept · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup
    it.each(['91234567', '1-------------2', '+12 3', 'call me maybe', '+65 9123 4567x'])(
      'rejects the phone number %p with a 400 and registers no one',
      async (phone) => {
        const event = await seedEvent('EVT-224');

        const res = await submit('a1', event.id, { phone }).expect(400);

        expect(JSON.stringify(res.body.message)).toMatch(/phone/);
        expect(await activeCount(event.id)).toBe(0);
      },
    );

    // Story 33 (registration form), kept · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup
    it('stores a standard accessibility option together with the Attendee’s own detail', async () => {
      const event = await seedEvent('EVT-224');

      const res = await submit('a1', event.id, {
        accessibilityFeature: 'HEARING_LOOP',
        accessibilityNeeds: 'Please seat me near the front',
      }).expect(201);

      expect(res.body).toMatchObject({
        accessibilityFeature: 'HEARING_LOOP',
        accessibilityNeeds: 'Please seat me near the front',
      });
      const row = await prisma.registration.findFirstOrThrow({
        where: { eventId: event.id },
      });
      expect(row.accessibilityFeature).toBe('HEARING_LOOP');
    });

    // Story 33 (registration form), kept · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup
    it('stores an Attendee’s own request when no standard option fits', async () => {
      const event = await seedEvent('EVT-224');

      const res = await submit('a1', event.id, {
        accessibilityNeeds: 'Sign-language interpreter',
      }).expect(201);

      expect(res.body.accessibilityFeature).toBeNull();
      expect(res.body.accessibilityNeeds).toBe('Sign-language interpreter');
    });

    // Story 33 (registration form), kept · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup
    it('rejects an accessibility option that is not on the list', async () => {
      const event = await seedEvent('EVT-224');

      await submit('a1', event.id, { accessibilityFeature: 'OTHER' }).expect(400);
      expect(await activeCount(event.id)).toBe(0);
    });

    // Story 33 (registration form), kept · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup
    it('no longer collects or returns dietary requirements', async () => {
      const event = await seedEvent('EVT-224');

      const res = await submit('a1', event.id, {
        dietaryRequirements: 'Vegetarian',
      }).expect(201);

      expect(res.body).not.toHaveProperty('dietaryRequirements');
      const row = await prisma.registration.findFirstOrThrow({
        where: { eventId: event.id },
      });
      expect(row.dietaryRequirements).toBeNull();
    });
  });

  describe('the Attendee’s browse list', () => {
    const browse = async (who: string) =>
      (await http().get('/events').set('Authorization', as(who)).expect(200)).body.map(
        (e: { name: string }) => e.name,
      );

    // Story 33 (browse list), kept · setup: base-users + tc-s3-99-setup + tc-s3-99c-setup
    it('keeps full and not-yet-open events in the list, and drops ones whose registration has closed', async () => {
      await given('tc-s3-99c-setup'); // Open, Full (1 place), Closed, Not yet open
      const full = await prisma.eventRequest.findFirstOrThrow({ where: { name: 'Full' } });
      await register('a1', full.id).expect(201);

      expect((await browse('a2')).sort()).toEqual(['Full', 'Not yet open', 'Open']);
    });

    // Story 33 (browse list), kept · setup: base-users + tc-s3-99-setup + tc-s3-99d-setup
    it('still hides events that are not confirmed, have registration off, have started, or that I hold', async () => {
      await given('tc-s3-99d-setup'); // Mine, Planning, Registration off, Started, Visible
      const mine = await prisma.eventRequest.findFirstOrThrow({ where: { name: 'Mine' } });
      await register('a1', mine.id).expect(201);

      expect(await browse('a1')).toEqual(['Visible']);
    });
  });

  describe('my registrations list', () => {
    // Story 34 (my registrations), kept · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup
    it('keeps withdrawn registrations below active ones, however the dates fall', async () => {
      await given('tc-s3-99b-setup');
      const soon = { id: 'EVT-225' }; // "Soon (will be withdrawn)", in 10 days
      const later = { id: 'EVT-226' }; // "Later", in 40 days
      const middle = { id: 'EVT-227' }; // "Middle", in 20 days
      const first = await register('a1', soon.id).expect(201);
      await register('a1', later.id).expect(201);
      await register('a1', middle.id).expect(201);
      await withdraw('a1', first.body.id).expect(200);

      const res = await http()
        .get('/registrations/me')
        .set('Authorization', as('a1'))
        .expect(200);

      expect(
        res.body.registrations.map((r: { event: { name: string }; status: string }) => [
          r.event.name,
          r.status,
        ]),
      ).toEqual([
        ['Middle', 'REGISTERED'],
        ['Later', 'REGISTERED'],
        ['Soon (will be withdrawn)', 'WITHDRAWN'],
      ]);
    });
  });

  describe('simultaneous submissions', () => {
    // TC-S3-103 · US-46 AC-5 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if two simultaneous registrations both take the last place
    // Code: RegistrationsService.register locks the event row (FOR UPDATE) before counting
    it('lets exactly one of two Attendees take the last remaining place', async () => {
      const event = await seedEvent('EVT-222'); // 1 place

      const results = await Promise.all([
        register('a1', event.id),
        register('a2', event.id),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await activeCount(event.id)).toBe(1);
    });

    // TC-S3-103 · US-46 AC-5 · setup: base-users + tc-s3-99-setup + tc-s3-99b-setup · fails if simultaneous registrations over-fill the event
    // Code: RegistrationsService.register row lock
    it('never over-fills when many Attendees race for a few places', async () => {
      const event = await seedEvent('EVT-223'); // 3 places

      const results = await Promise.all(attendeeKeys.map((key) => register(key, event.id)));

      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 409)).toHaveLength(attendeeKeys.length - 3);
      expect(await activeCount(event.id)).toBe(3);
    });
  });
});
