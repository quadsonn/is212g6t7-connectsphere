import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, RegistrationStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Register only while registration is open and places remain (e2e) — the
 * period and capacity rules, enforced by the server on a direct API call.
 */
describe('Registration period and capacity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const attendeeKeys = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, role: Role) => {
    const email = `${key}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 4), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  /** A CONFIRMED event 30 days out: inside the default window, so it is open. */
  const seedEvent = (overrides: Record<string, unknown> = {}) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name: 'Careers Fair',
        purpose: 'Meet employers',
        description: 'Stalls and talks',
        category: 'Careers',
        proposedStart: new Date(Date.now() + 30 * DAY),
        proposedEnd: new Date(Date.now() + 30 * DAY + 4 * 60 * 60 * 1000),
        expectedAttendance: 50,
        status: EventStatus.CONFIRMED,
        registrationEnabled: true,
        ...overrides,
      },
    });

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

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', Role.EVENT_ORGANISER);
    await seedUser('coordinator', Role.EVENT_COORDINATOR);
    for (const key of attendeeKeys) {
      await seedUser(key, Role.ATTENDEE);
    }
  });

  describe('the registration period', () => {
    it('rejects a registration submitted before registration opens, and shows the times', async () => {
      const opens = new Date(Date.now() + 2 * DAY);
      const closes = new Date(Date.now() + 9 * DAY);
      const event = await seedEvent({
        registrationOpensAt: opens,
        registrationClosesAt: closes,
      });

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

    it('rejects a registration submitted after registration closes, and shows the times', async () => {
      const opens = new Date(Date.now() - 9 * DAY);
      const closes = new Date(Date.now() - 1000);
      const event = await seedEvent({
        registrationOpensAt: opens,
        registrationClosesAt: closes,
      });

      const res = await register('a1', event.id).expect(409);

      expect(res.body.message).toContain(opens.toISOString());
      expect(res.body.message).toContain(closes.toISOString());
      expect(await activeCount(event.id)).toBe(0);

      const view = await options('a1', event.id).expect(200);
      expect(view.body).toMatchObject({ canRegister: false, block: 'CLOSED' });
    });

    it('accepts a registration inside the period', async () => {
      const event = await seedEvent({
        registrationOpensAt: new Date(Date.now() - DAY),
        registrationClosesAt: new Date(Date.now() + DAY),
      });

      await register('a1', event.id).expect(201);

      expect(await activeCount(event.id)).toBe(1);
    });

    it('rejects a direct API call for an event that does not allow registration at all', async () => {
      const closedToRegistration = await seedEvent({ registrationEnabled: false });

      await register('a1', closedToRegistration.id).expect(409);
      expect(await activeCount(closedToRegistration.id)).toBe(0);
    });
  });

  describe('capacity', () => {
    it('rejects with a "full" message once active registrations equal the capacity', async () => {
      const event = await seedEvent({ expectedAttendance: 2 });
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

    it('does not count a withdrawn registration, so its place can be taken', async () => {
      const event = await seedEvent({ expectedAttendance: 1 });
      const first = await register('a1', event.id).expect(201);
      await register('a2', event.id).expect(409);

      await withdraw('a1', first.body.id).expect(200);
      expect(await activeCount(event.id)).toBe(0);

      await register('a2', event.id).expect(201);
      expect(await activeCount(event.id)).toBe(1);
    });

    it('lets a withdrawn Attendee register again only while a place remains', async () => {
      const event = await seedEvent({ expectedAttendance: 1 });
      const first = await register('a1', event.id).expect(201);
      await withdraw('a1', first.body.id).expect(200);
      await register('a2', event.id).expect(201);

      const res = await register('a1', event.id).expect(409);

      expect(res.body.message).toMatch(/full/i);
    });

    it('has no waiting list: a full event simply rejects', async () => {
      const event = await seedEvent({ expectedAttendance: 1 });
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

    it.each([
      ['+65 9123 4567', '+6591234567'],
      ['+44 20 7946 0958', '+442079460958'],
      ['+1 (415) 555-2671', '+14155552671'],
      ['+91 98765 43210', '+919876543210'],
    ])('accepts the international number %p and stores it as %p', async (phone, stored) => {
      const event = await seedEvent();

      const res = await submit('a1', event.id, { phone }).expect(201);

      expect(res.body.phone).toBe(stored);
    });

    it.each(['91234567', '1-------------2', '+12 3', 'call me maybe', '+65 9123 4567x'])(
      'rejects the phone number %p with a 400 and registers no one',
      async (phone) => {
        const event = await seedEvent();

        const res = await submit('a1', event.id, { phone }).expect(400);

        expect(JSON.stringify(res.body.message)).toMatch(/phone/);
        expect(await activeCount(event.id)).toBe(0);
      },
    );

    it('stores a standard accessibility option together with the Attendee’s own detail', async () => {
      const event = await seedEvent();

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

    it('stores an Attendee’s own request when no standard option fits', async () => {
      const event = await seedEvent();

      const res = await submit('a1', event.id, {
        accessibilityNeeds: 'Sign-language interpreter',
      }).expect(201);

      expect(res.body.accessibilityFeature).toBeNull();
      expect(res.body.accessibilityNeeds).toBe('Sign-language interpreter');
    });

    it('rejects an accessibility option that is not on the list', async () => {
      const event = await seedEvent();

      await submit('a1', event.id, { accessibilityFeature: 'OTHER' }).expect(400);
      expect(await activeCount(event.id)).toBe(0);
    });

    it('no longer collects or returns dietary requirements', async () => {
      const event = await seedEvent();

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

  describe('my registrations list', () => {
    it('keeps withdrawn registrations below active ones, however the dates fall', async () => {
      const soon = await seedEvent({
        name: 'Soon (will be withdrawn)',
        proposedStart: new Date(Date.now() + 10 * DAY),
        proposedEnd: new Date(Date.now() + 10 * DAY + 3_600_000),
      });
      const later = await seedEvent({
        name: 'Later',
        proposedStart: new Date(Date.now() + 40 * DAY),
        proposedEnd: new Date(Date.now() + 40 * DAY + 3_600_000),
      });
      const middle = await seedEvent({
        name: 'Middle',
        proposedStart: new Date(Date.now() + 20 * DAY),
        proposedEnd: new Date(Date.now() + 20 * DAY + 3_600_000),
      });
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
    it('lets exactly one of two Attendees take the last remaining place', async () => {
      const event = await seedEvent({ expectedAttendance: 1 });

      const results = await Promise.all([
        register('a1', event.id),
        register('a2', event.id),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await activeCount(event.id)).toBe(1);
    });

    it('never over-fills when many Attendees race for a few places', async () => {
      const event = await seedEvent({ expectedAttendance: 3 });

      const results = await Promise.all(attendeeKeys.map((key) => register(key, event.id)));

      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 409)).toHaveLength(attendeeKeys.length - 3);
      expect(await activeCount(event.id)).toBe(3);
    });
  });
});
