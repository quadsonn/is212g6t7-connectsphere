import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient, ReservationStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-66 e2e — the assigned Technical Support member (US-61) is notified when
 * equipment work for their event arrives or changes, through the existing
 * cancel (US-43), reject-unfulfillable (US-47), change approval (US-48) and
 * technical requirements (US-27) endpoints.
 *
 * Code under test: TechnicalSupportNotifier (EQUIPMENT_EVENT_CANCELLED,
 * EQUIPMENT_RESERVATIONS_REBOOKED, EQUIPMENT_REQUEST_SUBMITTED), called from
 * the cancel, reject, change-approval and technical-requirements paths.
 *
 * Pre-condition for every test: reset the testDB, then run tc-s4-76-setup.sql
 * (Olga, Carla, and Wei and Nadia, the only two Technical Support members) and
 * tc-s4-104-setup.sql (Vanessa of Venue Staff, Main Hall, projectors and the
 * "Town Hall" EVT-312 with Wei assigned). base-users.sql is not loaded: its
 * Technical Support member would join the pool. The seed helpers below load
 * the variant scripts.
 */
describe('US-66 assigned Tech Support receive equipment notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from tc-s4-76-setup and tc-s4-104-setup. */
  const ids: Record<string, string> = {
    organiser: 'USR-038',
    coordinator: 'USR-039',
    venueStaff: 'USR-045',
    wei: 'USR-042',
    nadia: 'USR-043',
    event: 'EVT-312',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'olga.organiser@example.com',
    coordinator: 'carla@example.com',
    wei: 'wei.t@example.com',
  };


  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** The Town Hall (tc-s4-104-setup) as each test needs it: confirmed, or with nobody or Nadia assigned. */
  const seedEvent = async (
    { status = EventStatus.PLANNING as EventStatus, assignee = 'wei' as string | null } = {},
  ) => {
    if (status === EventStatus.CONFIRMED) await given('tc-s4-105-setup');
    if (assignee === null) await given('tc-s4-104b-setup');
    if (assignee === 'nadia') await given('tc-s4-104c-setup');
  };

  /** RSV-037: 2 approved (tc-s4-104d), 2 released (104e) or 3 approved (104f) projectors. */
  const seedReservation = (quantity = 2, status: ReservationStatus = ReservationStatus.APPROVED) =>
    given(
      status === ReservationStatus.RELEASED ? 'tc-s4-104e-setup' : quantity === 3 ? 'tc-s4-104f-setup' : 'tc-s4-104d-setup',
    );

  /** tc-s4-104g-setup: Main Hall approved for the Town Hall. */
  const seedApprovedBooking = () => given('tc-s4-104g-setup');

  const cancel = () =>
    http()
      .post(`/events/${ids.event}/cancel`)
      .set('Authorization', as('organiser'))
      .send({ reason: 'The keynote speaker withdrew.', confirm: true });
  const reject = () =>
    http()
      .post(`/events/${ids.event}/reject-unfulfillable`)
      .set('Authorization', as('coordinator'))
      .send({ reason: 'NO_AVAILABLE_EQUIPMENT', comment: 'Every projector is out that week.' });
  /** A pending change request moving the event a day later (1 Oct → 2 Oct 2030, 10:00–12:00 UTC), then its approval. */
  const approveMove = async () => {
    await given('tc-s4-105b-setup'); // CRQ-019
    const created = { id: 'CRQ-019' };
    const res = await http()
      .post(`/events/change-requests/${created.id}/approve`)
      .set('Authorization', as('coordinator'));
    expect(res.status).toBe(200);
  };
  const setRequirements = () =>
    http()
      .patch(`/events/${ids.event}/technical-requirements`)
      .set('Authorization', as('coordinator'))
      .send({
        equipment: [{ equipmentType: 'Wireless microphone', quantity: 2 }],
        technicalSupportNeeds: 'Hybrid setup for remote staff',
      });

  const notices = (type: NotificationType) =>
    prisma.notification.findMany({ where: { type }, orderBy: { id: 'asc' } });

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
    await given('tc-s4-76-setup', 'tc-s4-104-setup');
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
    await given('tc-s4-76-setup', 'tc-s4-104-setup');
  });

  describe('AC-1: cancelled or rejected with live reservations', () => {
    // TC-S4-104 · US-66 AC-1 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-104d-setup · fails if the assigned member is not told when an event with live reservations is cancelled or rejected, anyone else is, or a notice is sent with nothing released
    // Code: cancel / reject-unfulfillable -> EquipmentReservationsService release -> TechnicalSupportNotifier.reservationsReleased (EQUIPMENT_EVENT_CANCELLED)
    it('US-66 AC-1: cancel notifies the assigned staff when the event has live reservations', async () => {
      await seedEvent();
      await seedReservation(2);

      await cancel().expect(200);

      const sent = await notices(NotificationType.EQUIPMENT_EVENT_CANCELLED);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        recipientId: ids.wei,
        relatedEventId: ids.event,
        message: 'Event cancelled. Released: 2 × Projector.',
      });
    });

    // TC-S4-104 · US-66 AC-1 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-104e-setup · fails if the assigned member is not told when an event with live reservations is cancelled or rejected, anyone else is, or a notice is sent with nothing released
    // Code: cancel / reject-unfulfillable -> EquipmentReservationsService release -> TechnicalSupportNotifier.reservationsReleased (EQUIPMENT_EVENT_CANCELLED)
    it('US-66 AC-1: cancel with no live reservations notifies no one', async () => {
      await seedEvent();
      await seedReservation(2, ReservationStatus.RELEASED);

      await cancel().expect(200);

      expect(await notices(NotificationType.EQUIPMENT_EVENT_CANCELLED)).toHaveLength(0);
    });

    // TC-S4-104 · US-66 AC-1 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-104f-setup · fails if the assigned member is not told when an event with live reservations is cancelled or rejected, anyone else is, or a notice is sent with nothing released
    // Code: cancel / reject-unfulfillable -> EquipmentReservationsService release -> TechnicalSupportNotifier.reservationsReleased (EQUIPMENT_EVENT_CANCELLED)
    it('US-66 AC-1: reject notifies the assigned staff when the event has live reservations', async () => {
      await seedEvent();
      await seedReservation(3);

      await reject().expect(200);

      const sent = await notices(NotificationType.EQUIPMENT_EVENT_CANCELLED);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        recipientId: ids.wei,
        message: 'Event rejected as unfulfillable. Released: 3 × Projector.',
      });
    });

    // TC-S4-104 · US-66 AC-1 · setup: tc-s4-76-setup + tc-s4-104-setup · fails if the assigned member is not told when an event with live reservations is cancelled or rejected, anyone else is, or a notice is sent with nothing released
    // Code: cancel / reject-unfulfillable -> EquipmentReservationsService release -> TechnicalSupportNotifier.reservationsReleased (EQUIPMENT_EVENT_CANCELLED)
    it('US-66 AC-1: reject with no live reservations notifies no one', async () => {
      await seedEvent();

      await reject().expect(200);

      expect(await notices(NotificationType.EQUIPMENT_EVENT_CANCELLED)).toHaveLength(0);
    });

    // TC-S4-104 · US-66 AC-1 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-104b-setup + tc-s4-104d-setup · fails if the assigned member is not told when an event with live reservations is cancelled or rejected, anyone else is, or a notice is sent with nothing released
    // Code: cancel / reject-unfulfillable -> EquipmentReservationsService release -> TechnicalSupportNotifier.reservationsReleased (EQUIPMENT_EVENT_CANCELLED)
    it('US-66 AC-1: no notification when nobody is assigned', async () => {
      await seedEvent({ assignee: null });
      await seedReservation(2);

      await cancel().expect(200);

      expect(await notices(NotificationType.EQUIPMENT_EVENT_CANCELLED)).toHaveLength(0);
    });

    // TC-S4-104 · US-66 AC-1 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-104d-setup · fails if the assigned member is not told when an event with live reservations is cancelled or rejected, anyone else is, or a notice is sent with nothing released
    // Code: cancel / reject-unfulfillable -> EquipmentReservationsService release -> TechnicalSupportNotifier.reservationsReleased (EQUIPMENT_EVENT_CANCELLED)
    it('US-66 AC-1: only the assignee hears — other Technical Support do not', async () => {
      await seedEvent();
      await seedReservation(2);

      await cancel().expect(200);

      expect(await prisma.notification.count({ where: { recipientId: ids.nadia } })).toBe(0);
    });

    // TC-S4-104 · US-66 AC-1 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-104d-setup + tc-s4-104g-setup · fails if the assigned member is not told when an event with live reservations is cancelled or rejected, anyone else is, or a notice is sent with nothing released
    // Code: cancel / reject-unfulfillable -> EquipmentReservationsService release -> TechnicalSupportNotifier.reservationsReleased (EQUIPMENT_EVENT_CANCELLED)
    it('US-66 AC-1: the venue manager’s US-40 notice is still sent alongside', async () => {
      await seedEvent();
      await seedReservation(2);
      await seedApprovedBooking();

      await cancel().expect(200);

      expect(await notices(NotificationType.BOOKING_EVENT_CANCELLED)).toEqual([
        expect.objectContaining({ recipientId: ids.venueStaff }),
      ]);
      expect(await notices(NotificationType.EQUIPMENT_EVENT_CANCELLED)).toHaveLength(1);
    });
  });

  describe('AC-2: an approved change request rebooks the reservations', () => {
    // TC-S4-105 · US-66 AC-2 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-105-setup + tc-s4-104d-setup + tc-s4-105b-setup · fails if the assigned member is not told the old and new time when an approved change rebooks their reservations, or is told when nothing moved
    // Code: change-request approval rebook -> TechnicalSupportNotifier.reservationsRebooked (EQUIPMENT_RESERVATIONS_REBOOKED)
    it('US-66 AC-2: rebook on change approval notifies the assigned staff with the old and new time', async () => {
      await seedEvent({ status: EventStatus.CONFIRMED });
      await seedReservation(2);

      await approveMove();

      const sent = await notices(NotificationType.EQUIPMENT_RESERVATIONS_REBOOKED);
      expect(sent).toHaveLength(1);
      expect(sent[0].recipientId).toBe(ids.wei);
      expect(sent[0].relatedEventId).toBe(ids.event);
      expect(sent[0].message).toMatch(/^Time 1 Oct( 2030)?, 10:00–12:00 UTC → 2 Oct( 2030)?, 10:00–12:00 UTC\./);
      expect(sent[0].message).toContain('Rebooked: 2 × Projector.');
    });

    // TC-S4-105 · US-66 AC-2 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-105-setup + tc-s4-104b-setup + tc-s4-104d-setup + tc-s4-105b-setup · fails if the assigned member is not told the old and new time when an approved change rebooks their reservations, or is told when nothing moved
    // Code: change-request approval rebook -> TechnicalSupportNotifier.reservationsRebooked (EQUIPMENT_RESERVATIONS_REBOOKED)
    it('US-66 AC-2: no notification when nobody is assigned', async () => {
      await seedEvent({ status: EventStatus.CONFIRMED, assignee: null });
      await seedReservation(2);

      await approveMove();

      expect(await notices(NotificationType.EQUIPMENT_RESERVATIONS_REBOOKED)).toHaveLength(0);
    });

    // TC-S4-105 · US-66 AC-2 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-105-setup + tc-s4-105b-setup · fails if the assigned member is not told the old and new time when an approved change rebooks their reservations, or is told when nothing moved
    // Code: change-request approval rebook -> TechnicalSupportNotifier.reservationsRebooked (EQUIPMENT_RESERVATIONS_REBOOKED)
    it('US-66 AC-2: no notification when there was nothing to rebook', async () => {
      await seedEvent({ status: EventStatus.CONFIRMED });

      await approveMove();

      expect(await notices(NotificationType.EQUIPMENT_RESERVATIONS_REBOOKED)).toHaveLength(0);
    });

    // TC-S4-105 · US-66 AC-2 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-105-setup + tc-s4-104d-setup + tc-s4-104g-setup + tc-s4-105b-setup · fails if the assigned member is not told the old and new time when an approved change rebooks their reservations, or is told when nothing moved
    // Code: change-request approval rebook -> TechnicalSupportNotifier.reservationsRebooked (EQUIPMENT_RESERVATIONS_REBOOKED)
    it('US-66 AC-2: the venue manager’s US-40 notice is still sent alongside', async () => {
      await seedEvent({ status: EventStatus.CONFIRMED });
      await seedReservation(2);
      await seedApprovedBooking();

      await approveMove();

      expect(await notices(NotificationType.BOOKING_DETAILS_CHANGED)).toEqual([
        expect.objectContaining({ recipientId: ids.venueStaff }),
      ]);
    });
  });

  describe('AC-3: the equipment request routes to the pool before assignment', () => {
    // TC-S4-106 · US-66 AC-3 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-104b-setup · fails if an equipment request does not reach the whole pool before assignment and only the assignee after, is sent for a save that changes nothing, or lacks the link
    // Code: technical requirements save -> TechnicalSupportNotifier.requirementsChanged (EQUIPMENT_REQUEST_SUBMITTED)
    it('US-66 AC-3: equipment request submitted notifies all Tech Support while nobody is assigned', async () => {
      await seedEvent({ assignee: null });

      await setRequirements().expect(200);

      const sent = await notices(NotificationType.EQUIPMENT_REQUEST_SUBMITTED);
      expect(sent.map((n) => n.recipientId).sort()).toEqual([ids.wei, ids.nadia].sort());
      expect(sent[0]).toMatchObject({
        relatedEventId: ids.event,
        message: 'Equipment: 2 × Wireless microphone. Technical support: Hybrid setup for remote staff',
      });
    });

    // TC-S4-106 · US-66 AC-3 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-104c-setup · fails if an equipment request does not reach the whole pool before assignment and only the assignee after, is sent for a save that changes nothing, or lacks the link
    // Code: technical requirements save -> TechnicalSupportNotifier.requirementsChanged (EQUIPMENT_REQUEST_SUBMITTED)
    it('US-66 AC-3: once someone is assigned, only the assignee is notified', async () => {
      await seedEvent({ assignee: 'nadia' });

      await setRequirements().expect(200);

      const sent = await notices(NotificationType.EQUIPMENT_REQUEST_SUBMITTED);
      expect(sent.map((n) => n.recipientId)).toEqual([ids.nadia]);
    });

    // TC-S4-106 · US-66 AC-3 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-104b-setup · fails if an equipment request does not reach the whole pool before assignment and only the assignee after, is sent for a save that changes nothing, or lacks the link
    // Code: technical requirements save -> TechnicalSupportNotifier.requirementsChanged (EQUIPMENT_REQUEST_SUBMITTED)
    it('US-66 AC-3: a save that changes nothing sends nothing', async () => {
      await seedEvent({ assignee: null });
      await setRequirements().expect(200);
      // Kept by design: clears the first save's notices, so only the second is counted.
      await prisma.notification.deleteMany();

      await setRequirements().expect(200);

      expect(await notices(NotificationType.EQUIPMENT_REQUEST_SUBMITTED)).toHaveLength(0);
    });

    // TC-S4-106 · US-66 AC-3 · setup: tc-s4-76-setup + tc-s4-104-setup + tc-s4-104b-setup · fails if an equipment request does not reach the whole pool before assignment and only the assignee after, is sent for a save that changes nothing, or lacks the link
    // Code: technical requirements save -> TechnicalSupportNotifier.requirementsChanged (EQUIPMENT_REQUEST_SUBMITTED)
    it('US-66 AC-3: the notice links Technical Support to the event’s requirements', async () => {
      await seedEvent({ assignee: null });
      await setRequirements().expect(200);

      const { body } = await http().get('/notifications').set('Authorization', as('wei')).expect(200);

      expect(body[0]).toMatchObject({
        type: NotificationType.EQUIPMENT_REQUEST_SUBMITTED,
        relatedEvent: { id: ids.event, name: 'Town Hall' },
        link: `/equipment/requirements/${ids.event}`,
      });
    });
  });
});
