import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-65 e2e — the Organiser who cancels an event gets their own confirmation,
 * through the real cancel endpoint (US-43): what was released and the reason
 * they gave. The Coordinator and Attendees keep the notice US-43 sends them.
 *
 * Code under test: EventsCancellationService.notifyCancelled and
 * organiserConfirmation.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql;
 * each test then loads tc-s4-102-setup.sql ("Careers Fair" EVT-311, confirmed,
 * holding Main Hall, two microphone reservations and Ann's registration).
 */
describe('US-65 cancellation confirmation for the Organiser (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed users from base-users. */
  const ids: Record<string, string> = {
    organiser: 'USR-006',
    coordinator: 'USR-004',
    attendee: 'USR-001',
  };
  const LOGINS: Record<string, string> = { organiser: 'organiser@example.com' };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** tc-s4-102-setup: a confirmed event holding one venue booking, two equipment reservations and one registration. */
  const seedHeldEvent = async () => {
    await given('tc-s4-102-setup');
    return { id: 'EVT-311' };
  };

  const cancel = (eventId: string, reason = 'Speaker withdrew') =>
    http()
      .post(`/events/${eventId}/cancel`)
      .set('Authorization', as('organiser'))
      .send({ reason, confirm: true });

  const cancellationNotices = (eventId: string) =>
    prisma.notification.findMany({
      where: { relatedEventId: eventId, type: NotificationType.EVENT_CANCELLED },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await given('base-users');
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
    await given('base-users');
  });

  // TC-S4-102 · US-65 AC-3 · setup: base-users + tc-s4-102-setup · fails if the Organiser gets no confirmation of their own cancellation, or it lacks the event name, what was released or the reason
  // Code: EventsCancellationService.notifyCancelled -> organiserConfirmation
  it('confirms the cancellation to the Organiser, with what was released and their reason', async () => {
    const event = await seedHeldEvent();

    const res = await cancel(event.id).expect(200);

    expect(res.body.released).toEqual({ venueBookings: 1, equipmentReservations: 2 });
    const own = (await cancellationNotices(event.id)).filter((n) => n.recipientId === ids.organiser);
    expect(own).toHaveLength(1);
    expect(own[0].message).toBe(
      'You cancelled "Careers Fair". 1 venue booking and 2 equipment reservations were released. Reason: Speaker withdrew',
    );
  });

  // TC-S4-102 · US-65 AC-3 · setup: base-users + tc-s4-102-setup · fails if the confirmation is not in the Organiser's inbox with the reason, linked to their event
  // Code: EventsCancellationService.notifyCancelled; notification-view (splitReason, linkFor)
  it('shows in the Organiser’s inbox with the reason on its own line, linked to their event', async () => {
    const event = await seedHeldEvent();
    await cancel(event.id).expect(200);

    const inbox = await http().get('/notifications').set('Authorization', as('organiser')).expect(200);

    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0]).toMatchObject({
      type: 'EVENT_CANCELLED',
      summary: 'You cancelled "Careers Fair". 1 venue booking and 2 equipment reservations were released.',
      reason: 'Speaker withdrew',
      link: `/organiser/${event.id}`,
    });
  });

  // TC-S4-102 · US-65 AC-3 · setup: base-users + tc-s4-102-setup · fails if the Coordinator's and Attendees' notice changes, or the Organiser is counted among them
  // Code: EventsCancellationService.notifyCancelled (Organiser removed from the AC-8 recipients)
  it('keeps the Coordinator’s and Attendees’ notice as it was, and does not count the Organiser in it', async () => {
    const event = await seedHeldEvent();

    const res = await cancel(event.id).expect(200);

    expect(res.body.notified).toBe(2);
    const others = (await cancellationNotices(event.id)).filter((n) => n.recipientId !== ids.organiser);
    expect(others.map((n) => n.recipientId).sort()).toEqual([ids.coordinator, ids.attendee].sort());
    for (const n of others) {
      expect(n.message).toBe('Careers Fair has been cancelled. Reason: Speaker withdrew');
    }
  });

  // TC-S4-103 · US-65 AC-4 · setup: base-users + tc-s4-102-setup + tc-s4-103-setup · fails if an Organiser who is also a registered Attendee gets more than one cancellation notice
  // Code: EventsCancellationService.notifyCancelled (recipients.delete(organiserId))
  it('AC2: Given the Organiser is also registered as an attendee, When they cancel, Then they get exactly one notice', async () => {
    const event = await seedHeldEvent();
    // Only Attendees may register through the API; a row like this can still
    // exist in the data, and the Organiser must not be told twice.
    await given('tc-s4-103-setup');

    const res = await cancel(event.id).expect(200);

    const own = (await cancellationNotices(event.id)).filter((n) => n.recipientId === ids.organiser);
    expect(own).toHaveLength(1);
    expect(own[0].message).toMatch(/^You cancelled "Careers Fair"\./);
    expect(res.body.notified).toBe(2);
  });

  // TC-S4-102 · US-65 AC-3 · setup: base-users + tc-s4-102-setup + tc-s4-102b-setup · fails if a refused cancellation sends anyone a notice
  // Code: EventsCancellationService.cancel (notices only after a committed cancellation)
  it('sends nothing when the cancellation is refused', async () => {
    const event = await seedHeldEvent();
    await given('tc-s4-102b-setup'); // the event has already taken place

    await cancel(event.id).expect(409);

    expect(await cancellationNotices(event.id)).toEqual([]);
  });

  // TC-S4-108 · US-67 AC-2 · setup: base-users + tc-s4-102-setup · fails if the event's Coordinator is not told that its committed equipment was released when the event was cancelled
  // Code: EventsCancellationService.cancel -> EquipmentReservationsService release -> EquipmentNotifier.released (EQUIPMENT_RELEASED)
  it('US-67 AC-2: tells the event’s Coordinator that its equipment was released', async () => {
    const event = await seedHeldEvent();

    await cancel(event.id).expect(200);

    const released = await prisma.notification.findMany({
      where: { relatedEventId: event.id, type: NotificationType.EQUIPMENT_RELEASED },
    });
    expect(released.map((n) => n.recipientId)).toEqual([ids.coordinator]);
    expect(released[0].message).toContain('Careers Fair');
    expect(released[0].message).toContain('cancelled');
  });
});
