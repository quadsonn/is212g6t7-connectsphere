import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingDecisionKind,
  BookingStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  ReservationStatus,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-66 e2e — the assigned Technical Support member (US-61) is notified when
 * equipment work for their event arrives or changes, through the existing
 * cancel (US-43), reject-unfulfillable (US-47), change approval (US-48) and
 * technical requirements (US-27) endpoints.
 */
describe('US-66 assigned Tech Support receive equipment notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const OLD = { start: new Date('2030-10-01T10:00:00Z'), end: new Date('2030-10-01T12:00:00Z') };
  const NEW = { start: new Date('2030-10-02T10:00:00Z'), end: new Date('2030-10-02T12:00:00Z') };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, email: string, role: Role, name = key) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedEvent = async (
    { status = EventStatus.PLANNING as EventStatus, assignee = 'wei' as string | null } = {},
  ) => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name: 'Town Hall',
        purpose: 'p',
        description: 'd',
        category: 'c',
        proposedStart: OLD.start,
        proposedEnd: OLD.end,
        expectedAttendance: 100,
        technicalSupportNeeds: 'On-site AV technician',
        technicalSupportId: assignee ? ids[assignee] : null,
        status,
      },
    });
    ids.event = event.id;
    return event;
  };

  const seedReservation = (quantity = 2, status: ReservationStatus = ReservationStatus.APPROVED) =>
    prisma.equipmentReservation.create({
      data: {
        eventId: ids.event,
        equipmentId: ids.projector,
        quantity,
        start: OLD.start,
        end: OLD.end,
        status,
      },
    });

  const seedApprovedBooking = async () => {
    const booking = await prisma.venueBooking.create({
      data: {
        eventId: ids.event,
        venueId: ids.hall,
        start: OLD.start,
        end: OLD.end,
        status: BookingStatus.APPROVED,
        expectedAttendance: 100,
        requestedById: ids.coordinator,
      },
    });
    await prisma.bookingDecision.create({
      data: {
        bookingId: booking.id,
        decidedById: ids.venueStaff,
        kind: BookingDecisionKind.DECISION,
        outcome: BookingStatus.APPROVED,
      },
    });
  };

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
  /** A pending change request moving the event to NEW, then its approval. */
  const approveMove = async () => {
    const created = await prisma.eventChangeRequest.create({
      data: {
        eventId: ids.event,
        requestedById: ids.organiser,
        reason: 'The keynote speaker moved.',
        proposedStart: NEW.start,
        proposedEnd: NEW.end,
      },
    });
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

  /** Everything these tests create, children first. */
  const clear = async () => {
    await prisma.notification.deleteMany();
    await prisma.eventChange.deleteMany();
    await prisma.eventChangeRequest.deleteMany();
    await prisma.equipmentRequirement.deleteMany();
    await prisma.equipmentReservation.updateMany({ data: { replacedById: null } });
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.bookingSuggestion.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.updateMany({ data: { replacesBookingId: null, replacedByBookingId: null } });
    await prisma.venueBooking.deleteMany();
    await prisma.venueBlock.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await listenOnLoopback(app);

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    // Leave nothing behind for suites that delete users directly (status
    // changes and assignments reference users).
    await clear();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await clear();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('venueStaff', 'venue@example.com', Role.VENUE_STAFF);
    await seedUser('wei', 'wei@example.com', Role.TECHNICAL_SUPPORT_STAFF, 'Wei Technical');
    await seedUser('nadia', 'nadia@example.com', Role.TECHNICAL_SUPPORT_STAFF, 'Nadia Technical');

    ids.projector = (
      await prisma.equipment.create({ data: { type: 'Projector', totalQuantity: 10 } })
    ).id;
    ids.hall = (
      await prisma.venue.create({
        data: {
          name: 'Main Hall',
          location: 'Level 1',
          capacity: 300,
          status: VenueStatus.PUBLISHED,
          managedById: ids.venueStaff,
        },
      })
    ).id;
  });

  describe('AC-1: cancelled or rejected with live reservations', () => {
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

    it('US-66 AC-1: cancel with no live reservations notifies no one', async () => {
      await seedEvent();
      await seedReservation(2, ReservationStatus.RELEASED);

      await cancel().expect(200);

      expect(await notices(NotificationType.EQUIPMENT_EVENT_CANCELLED)).toHaveLength(0);
    });

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

    it('US-66 AC-1: reject with no live reservations notifies no one', async () => {
      await seedEvent();

      await reject().expect(200);

      expect(await notices(NotificationType.EQUIPMENT_EVENT_CANCELLED)).toHaveLength(0);
    });

    it('US-66 AC-1: no notification when nobody is assigned', async () => {
      await seedEvent({ assignee: null });
      await seedReservation(2);

      await cancel().expect(200);

      expect(await notices(NotificationType.EQUIPMENT_EVENT_CANCELLED)).toHaveLength(0);
    });

    it('US-66 AC-1: only the assignee hears — other Technical Support do not', async () => {
      await seedEvent();
      await seedReservation(2);

      await cancel().expect(200);

      expect(await prisma.notification.count({ where: { recipientId: ids.nadia } })).toBe(0);
    });

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

    it('US-66 AC-2: no notification when nobody is assigned', async () => {
      await seedEvent({ status: EventStatus.CONFIRMED, assignee: null });
      await seedReservation(2);

      await approveMove();

      expect(await notices(NotificationType.EQUIPMENT_RESERVATIONS_REBOOKED)).toHaveLength(0);
    });

    it('US-66 AC-2: no notification when there was nothing to rebook', async () => {
      await seedEvent({ status: EventStatus.CONFIRMED });

      await approveMove();

      expect(await notices(NotificationType.EQUIPMENT_RESERVATIONS_REBOOKED)).toHaveLength(0);
    });

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

    it('US-66 AC-3: once someone is assigned, only the assignee is notified', async () => {
      await seedEvent({ assignee: 'nadia' });

      await setRequirements().expect(200);

      const sent = await notices(NotificationType.EQUIPMENT_REQUEST_SUBMITTED);
      expect(sent.map((n) => n.recipientId)).toEqual([ids.nadia]);
    });

    it('US-66 AC-3: a save that changes nothing sends nothing', async () => {
      await seedEvent({ assignee: null });
      await setRequirements().expect(200);
      await prisma.notification.deleteMany();

      await setRequirements().expect(200);

      expect(await notices(NotificationType.EQUIPMENT_REQUEST_SUBMITTED)).toHaveLength(0);
    });

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
