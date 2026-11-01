import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { RegistrationNotificationsService } from '../src/registrations/registration-notifications.service';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-59 e2e — Attendees told when registration opens, closes, or the event
 * nears capacity. The notices come from a once-a-minute sweep; under test the
 * scheduler is not started, so each test calls the sweep directly, with the
 * moment ("now") it should judge by. Registrations, withdrawals and venue
 * changes go through the real API.
 *
 * Code under test: RegistrationNotificationsService (notifyOpened,
 * notifyClosed, notifyNearCapacity), registration-notifications.ts
 * (venueCapacityOf, isNearCapacity).
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * tc-s3-99-setup.sql (Attendees a1 to a8) and tc-s4-65-setup.sql ("Careers
 * Fair" EVT-302: two venues of 10 and 8, three Registered and one Withdrawn).
 */
describe('US-59 registration window notices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let notices: RegistrationNotificationsService;

  const PASSWORD = 'correct-horse-battery-staple';
  const EVENT = 'EVT-302';
  const LOGINS: Record<string, string> = {
    ann: 'attendee@example.com',
    a1: 'a1@example.com',
    a5: 'a5@example.com',
    a6: 'a6@example.com',
    a7: 'a7@example.com',
    a8: 'a8@example.com',
    staff: 'venue.staff@example.com',
  };
  const tokens: Record<string, string> = {};
  const REGISTERED = ['USR-020', 'USR-021', 'USR-022'];
  /** Before the closing time (28 Nov 2030), and after it. */
  const OPEN_NOW = new Date('2030-11-01T00:00:00Z');
  const AFTER_CLOSE = new Date('2030-11-29T00:00:00Z');

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };
  const register = (who: string) =>
    http().post('/registrations').set('Authorization', as(who)).send({ eventId: EVENT, phone: '+65 9123 4567' }).expect(201);
  const recipients = async (type: NotificationType, eventId = EVENT) =>
    (await prisma.notification.findMany({ where: { type, relatedEventId: eventId } })).map((n) => n.recipientId).sort();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    prisma = new PrismaClient();
    notices = app.get(RegistrationNotificationsService);

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await given('base-users', 'tc-s3-99-setup');
    for (const [key, email] of Object.entries(LOGINS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('base-users', 'tc-s3-99-setup', 'tc-s4-65-setup');
  });

  describe('AC-1/AC-2: registration opens', () => {
    // TC-S4-65, TC-S4-66 · US-59 AC-1, AC-2 · setup: base-users + tc-s3-99-setup + tc-s4-65-setup · fails if an Attendee who has not registered is not told, a registered one is, the notice has no link to the event, or it is sent twice
    // Code: RegistrationNotificationsService.notifyOpened (claim registrationOpenedNotifiedAt; every ATTENDEE not REGISTERED)
    it('tells every Attendee not registered, once, with a link to the event', async () => {
      await notices.notifyOpened(OPEN_NOW);
      await notices.notifyOpened(OPEN_NOW);

      // Ann and a4 to a8 (a4 withdrew, so is not registered); not a1 to a3.
      expect(await recipients(NotificationType.REGISTRATION_OPENED)).toEqual(
        ['USR-001', 'USR-023', 'USR-024', 'USR-025', 'USR-026', 'USR-027'],
      );
      const [inbox] = (await http().get('/notifications').set('Authorization', as('ann')).expect(200)).body;
      expect(inbox).toMatchObject({ type: 'REGISTRATION_OPENED', link: `/events/${EVENT}` });
      expect(inbox.summary).toContain('Registration is now open for "Careers Fair"');
    });

    // TC-S4-65 · US-59 AC-1 · setup: base-users + tc-s3-99-setup + tc-s4-65-setup + tc-s4-65b-setup · fails if Attendees are told registration is open before its opening time
    // Code: RegistrationNotificationsService.notifyOpened (resolveWindow opensAt; skipped until it has come)
    // Regression test for gap #5 (the notice used to go out on confirmation).
    it('says nothing for an event whose registration has not opened yet, then tells them once it opens', async () => {
      await given('tc-s4-65b-setup');

      // Spring Gala opens 1 Oct 2030: a month before, then the day after.
      await notices.notifyOpened(new Date('2030-09-01T00:00:00Z'));
      expect(await recipients(NotificationType.REGISTRATION_OPENED, 'EVT-303')).toEqual([]);

      await notices.notifyOpened(new Date('2030-10-02T00:00:00Z'));
      expect(await recipients(NotificationType.REGISTRATION_OPENED, 'EVT-303')).toHaveLength(9);
    });
  });

  describe('AC-3: registration closes', () => {
    // TC-S4-67 · US-59 AC-3 · setup: base-users + tc-s3-99-setup + tc-s4-65-setup · fails if the Registered Attendees are not told when registration closes, anyone else is, it is sent before the closing time, or twice
    // Code: RegistrationNotificationsService.notifyClosed (resolveWindow closesAt; registered only)
    it('tells only the Registered Attendees, once, after the closing time', async () => {
      await notices.notifyClosed(OPEN_NOW);
      expect(await recipients(NotificationType.REGISTRATION_CLOSED)).toEqual([]);

      await notices.notifyClosed(AFTER_CLOSE);
      await notices.notifyClosed(AFTER_CLOSE);

      expect(await recipients(NotificationType.REGISTRATION_CLOSED)).toEqual(REGISTERED);
    });
  });

  describe('AC-4 to AC-8: nearing capacity', () => {
    // TC-S4-68, TC-S4-69 · US-59 AC-4, AC-5 · setup: base-users + tc-s3-99-setup + tc-s4-65-setup · fails if capacity is not the venues' total, or the Registered Attendees are not told at 10 or fewer seats left
    // Code: venueCapacityOf (sum of approved venues), isNearCapacity (<= 10 left), notifyNearCapacity
    it('counts every approved venue, and tells the Registered Attendees once 10 or fewer seats are left', async () => {
      // 18 seats across the two venues, 3 taken: 15 left. (Main Hall alone would be 7 left.)
      await notices.notifyNearCapacity();
      expect(await recipients(NotificationType.REGISTRATION_NEAR_CAPACITY)).toEqual([]);

      for (const who of ['ann', 'a5', 'a6', 'a7', 'a8']) await register(who);
      await notices.notifyNearCapacity();

      const notified = await recipients(NotificationType.REGISTRATION_NEAR_CAPACITY);
      expect(notified).toEqual(['USR-001', ...REGISTERED, 'USR-024', 'USR-025', 'USR-026', 'USR-027']);
      const note = await prisma.notification.findFirstOrThrow({ where: { type: NotificationType.REGISTRATION_NEAR_CAPACITY } });
      expect(note).toMatchObject({ relatedEventId: EVENT, message: 'Only 10 places left for "Careers Fair".' });
    });

    // TC-S4-70 · US-59 AC-6 · setup: base-users + tc-s3-99-setup + tc-s4-65-setup · fails if reducing a venue's capacity to 10 or fewer seats left does not notify
    // Code: notifyNearCapacity reads the current venue capacities on every sweep
    it("also notifies when a venue's capacity is reduced", async () => {
      await http().patch('/venues/VEN-083').set('Authorization', as('staff')).send({ capacity: 4 }).expect(200);

      await notices.notifyNearCapacity();

      // 4 + 8 = 12 seats, 3 taken: 9 left.
      expect(await recipients(NotificationType.REGISTRATION_NEAR_CAPACITY)).toEqual(REGISTERED);
    });

    // TC-S4-71 · US-59 AC-7 · setup: base-users + tc-s3-99-setup + tc-s4-65-setup · fails if the notice is sent again after seats free up and the event fills once more
    // Code: notifyNearCapacity (registrationNearCapacityNotifiedAt claimed once, never cleared)
    it('is sent only the first time, even if seats free up and fill again', async () => {
      await http().patch('/venues/VEN-083').set('Authorization', as('staff')).send({ capacity: 4 }).expect(200);
      await notices.notifyNearCapacity();

      await http().post('/registrations/REG-016/withdraw').set('Authorization', as('a1')).send({ confirm: true }).expect(200);
      await notices.notifyNearCapacity();
      await register('a1');
      await notices.notifyNearCapacity();

      expect(await recipients(NotificationType.REGISTRATION_NEAR_CAPACITY)).toEqual(REGISTERED);
    });

    // TC-S4-72 · US-59 AC-8 · setup: base-users + tc-s3-99-setup + tc-s4-65-setup + tc-s4-72-setup · fails if a near-capacity notice is sent for an event whose venue capacity is not known
    // Code: venueCapacityOf (null when no capacity is known) -> isNearCapacity false
    it('sends nothing when no venue capacity is known', async () => {
      await given('tc-s4-72-setup');
      for (const who of ['ann', 'a5', 'a6', 'a7', 'a8']) await register(who);

      await notices.notifyNearCapacity();

      expect(await recipients(NotificationType.REGISTRATION_NEAR_CAPACITY)).toEqual([]);
    });
  });
});
