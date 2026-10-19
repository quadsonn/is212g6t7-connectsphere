import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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

/** US-42 e2e — the Coordinator confirms an event once its arrangements are ready. */
describe('US-42 confirm event when arrangements are ready (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const START = new Date('2030-11-01T10:00:00Z');
  const END = new Date('2030-11-01T14:00:00Z');

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedEvent = (status: EventStatus = EventStatus.PLANNING) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name: 'Graduation showcase',
        purpose: 'Celebration',
        description: 'Final-year projects on show',
        category: 'Academic',
        proposedStart: START,
        proposedEnd: END,
        expectedAttendance: 120,
        status,
      },
    });

  const seedVenue = (name: string) =>
    prisma.venue.create({
      data: {
        name,
        location: 'School of Computing',
        capacity: 300,
        status: VenueStatus.PUBLISHED,
        managedById: ids.staff,
      },
    });

  const seedBooking = async (
    eventId: string,
    venueName: string,
    status: BookingStatus = BookingStatus.APPROVED,
    needsReview = false,
  ) => {
    const venue = await seedVenue(venueName);
    return prisma.venueBooking.create({
      data: {
        eventId,
        venueId: venue.id,
        start: START,
        end: END,
        status,
        needsReview,
        requestedById: ids.coordinator,
      },
    });
  };

  const seedEquipment = (type: string, totalQuantity = 10) =>
    prisma.equipment.create({ data: { type, totalQuantity } });

  const seedRequirement = (
    eventId: string,
    equipmentType: string,
    quantity: number,
    equipmentId: string | null = null,
  ) =>
    prisma.equipmentRequirement.create({
      data: { eventId, equipmentType, quantity, equipmentId },
    });

  const seedReservation = (
    eventId: string,
    equipmentId: string,
    quantity: number,
    status: ReservationStatus = ReservationStatus.APPROVED,
  ) =>
    prisma.equipmentReservation.create({
      data: { eventId, equipmentId, quantity, start: START, end: END, status },
    });

  const readiness = (eventId: string, who = 'coordinator') =>
    http().get(`/events/${eventId}/confirmation-readiness`).set('Authorization', as(who));

  const confirm = (eventId: string, who = 'coordinator') =>
    http().post(`/events/${eventId}/confirm`).set('Authorization', as(who));

  const manualConfirm = (eventId: string, reqId: string, who = 'coordinator') =>
    http()
      .post(`/events/${eventId}/requirements/${reqId}/manual-confirm`)
      .set('Authorization', as(who));

  const undoManualConfirm = (eventId: string, reqId: string, who = 'coordinator') =>
    http()
      .delete(`/events/${eventId}/requirements/${reqId}/manual-confirm`)
      .set('Authorization', as(who));

  const event = (id: string) => prisma.eventRequest.findUniqueOrThrow({ where: { id } });

  const outstanding = (body: { items: { label: string; status: string }[] }) =>
    body.items.filter((item) => item.status !== 'OK').map((item) => item.label);

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
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venueBlock.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipmentRequirement.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.eventChange.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('otherCoordinator', 'other.coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
  });

  describe('AC-1/AC-2: readiness checklist — venues', () => {
    it('US-42 AC-2: no venue booked', async () => {
      const ev = await seedEvent();

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(outstanding(res.body)).toEqual(['No venue booked']);
    });

    it('US-42 AC-2: one REQUESTED booking is still pending', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A', BookingStatus.REQUESTED);

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(outstanding(res.body)).toEqual(['Venue booking at Hall A still pending']);
    });

    it('US-42 AC-2: an APPROVED booking flagged for review needs conflict review', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Room 2', BookingStatus.APPROVED, true);

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(outstanding(res.body)).toEqual(['Venue booking at Room 2 needs conflict review']);
    });

    it('US-42 AC-1: two venues with one pending is not ready', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A');
      await seedBooking(ev.id, 'Room 2', BookingStatus.REQUESTED);

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(outstanding(res.body)).toEqual(['Venue booking at Room 2 still pending']);
    });

    it('US-42 AC-1: every booking APPROVED and no equipment is ready', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A');
      await seedBooking(ev.id, 'Room 2');
      await seedBooking(ev.id, 'Annex', BookingStatus.REJECTED);

      const res = await readiness(ev.id).expect(200);

      expect(res.body).toEqual({
        ready: true,
        items: [
          { kind: 'VENUE', label: 'Venue booking at Hall A approved', status: 'OK' },
          { kind: 'VENUE', label: 'Venue booking at Room 2 approved', status: 'OK' },
        ],
      });
    });
  });

  describe('AC-1/AC-2: readiness checklist — equipment', () => {
    it('US-42 AC-2: a linked line under-reserved reads 1 of 2', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A');
      const projector = await seedEquipment('Projector');
      await seedRequirement(ev.id, 'Projector', 2, projector.id);
      await seedReservation(ev.id, projector.id, 1);

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(outstanding(res.body)).toEqual(['Projector not reserved (1 of 2)']);
    });

    it('US-42: only a REQUESTED reservation does not satisfy the line', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A');
      const projector = await seedEquipment('Projector');
      await seedRequirement(ev.id, 'Projector', 2, projector.id);
      await seedReservation(ev.id, projector.id, 2, ReservationStatus.REQUESTED);

      const res = await readiness(ev.id).expect(200);

      expect(outstanding(res.body)).toEqual(['Projector not reserved (0 of 2)']);
    });

    it('US-42 AC-2: an unticked free-text line needs a manual check', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A');
      await seedRequirement(ev.id, 'Stage lighting rig', 1);

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(res.body.items).toContainEqual({
        kind: 'EQUIPMENT',
        label: 'Stage lighting rig - needs manual check',
        status: 'NEEDS_MANUAL_CHECK',
      });
    });

    it('US-42: a fully reserved line and a ticked free-text line are ready', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A');
      const projector = await seedEquipment('Projector');
      await seedRequirement(ev.id, 'Projector', 2, projector.id);
      await seedReservation(ev.id, projector.id, 2);
      const rig = await seedRequirement(ev.id, 'Stage lighting rig', 1);

      await manualConfirm(ev.id, rig.id).expect(200);
      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(true);
    });

    it('US-42: readiness is for the assigned Coordinator only', async () => {
      const ev = await seedEvent();

      // Lead assignment story: another Coordinator cannot see the event at all.
      await readiness(ev.id, 'otherCoordinator').expect(404);
      await readiness(ev.id, 'organiser').expect(403);
    });
  });

  describe('manual confirmation of free-text lines', () => {
    it('US-42: ticking records who and when; undo clears it', async () => {
      const ev = await seedEvent();
      const rig = await seedRequirement(ev.id, 'Stage lighting rig', 1);

      const res = await manualConfirm(ev.id, rig.id).expect(200);
      expect(res.body.manuallyConfirmedById).toBe(ids.coordinator);
      expect(res.body.manuallyConfirmedAt).not.toBeNull();

      const undone = await undoManualConfirm(ev.id, rig.id).expect(200);
      expect(undone.body.manuallyConfirmedAt).toBeNull();
      expect(undone.body.manuallyConfirmedById).toBeNull();

      const row = await prisma.equipmentRequirement.findUniqueOrThrow({ where: { id: rig.id } });
      expect(row.manuallyConfirmedAt).toBeNull();
    });

    it('US-42: a Coordinator not assigned to the event cannot see it (404); its Organiser gets 403', async () => {
      const ev = await seedEvent();
      const rig = await seedRequirement(ev.id, 'Stage lighting rig', 1);

      await manualConfirm(ev.id, rig.id, 'otherCoordinator').expect(404);
      await undoManualConfirm(ev.id, rig.id, 'otherCoordinator').expect(404);
      await manualConfirm(ev.id, rig.id, 'organiser').expect(403);
    });

    it('US-42: a catalogue-linked line cannot be ticked (400)', async () => {
      const ev = await seedEvent();
      const projector = await seedEquipment('Projector');
      const line = await seedRequirement(ev.id, 'Projector', 2, projector.id);

      await manualConfirm(ev.id, line.id).expect(400);
      await undoManualConfirm(ev.id, line.id).expect(400);
    });

    it('US-42: a line from another event is not found', async () => {
      const ev = await seedEvent();
      const other = await seedEvent();
      const rig = await seedRequirement(other.id, 'Stage lighting rig', 1);

      await manualConfirm(ev.id, rig.id).expect(404);
    });

    it('US-42: a tick survives an edit that leaves the line unchanged', async () => {
      const ev = await seedEvent();
      const rig = await seedRequirement(ev.id, 'Stage lighting rig', 1);
      await manualConfirm(ev.id, rig.id).expect(200);

      await http()
        .patch(`/events/${ev.id}/technical-requirements`)
        .set('Authorization', as('coordinator'))
        .send({
          equipment: [
            { equipmentType: 'Stage lighting rig', quantity: 1 },
            { equipmentType: 'Smoke machine', quantity: 1 },
          ],
        })
        .expect(200);

      const lines = await prisma.equipmentRequirement.findMany({ where: { eventId: ev.id } });
      const byType = Object.fromEntries(lines.map((l) => [l.equipmentType, l]));
      expect(byType['Stage lighting rig'].manuallyConfirmedById).toBe(ids.coordinator);
      expect(byType['Smoke machine'].manuallyConfirmedAt).toBeNull();
    });
  });

  describe('AC-3/AC-4: confirming', () => {
    it('US-42 AC-4: a ready event moves to AWAITING_SAFETY_CHECK with who and when', async () => {
      const ev = await seedEvent(EventStatus.AWAITING_ARRANGEMENTS);
      await seedBooking(ev.id, 'Hall A');
      const before = Date.now();

      const res = await confirm(ev.id).expect(200);

      expect(res.body.status).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      const row = await event(ev.id);
      expect(row.status).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      expect(row.arrangementsConfirmedById).toBe(ids.coordinator);
      expect(row.arrangementsConfirmedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('US-42: confirming works from PLANNING too', async () => {
      const ev = await seedEvent(EventStatus.PLANNING);
      await seedBooking(ev.id, 'Hall A');

      await confirm(ev.id).expect(200);

      expect((await event(ev.id)).status).toBe(EventStatus.AWAITING_SAFETY_CHECK);
    });

    it('US-42 AC-5: the Organiser is notified and sees the new status', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A');

      await confirm(ev.id).expect(200);

      const notes = await prisma.notification.findMany({ where: { recipientId: ids.organiser } });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        type: NotificationType.EVENT_STATUS_CHANGED,
        relatedEventId: ev.id,
      });
      expect(notes[0].message).toContain('Arrangements confirmed - awaiting safety review');

      const view = await http()
        .get(`/events/mine/${ev.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);
      expect(view.body.status).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      expect(view.body.arrangementsConfirmedAt).not.toBeNull();
    });

    it('US-42 AC-3: a Coordinator not assigned to the event cannot confirm it (404: they cannot see it)', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A');

      await confirm(ev.id, 'otherCoordinator').expect(404);
      await confirm(ev.id, 'organiser').expect(403);

      expect((await event(ev.id)).status).toBe(EventStatus.PLANNING);
    });

    it('US-42: an event that is not in planning cannot be confirmed (409)', async () => {
      const ev = await seedEvent(EventStatus.APPROVED);
      await seedBooking(ev.id, 'Hall A');

      await confirm(ev.id).expect(409);

      expect((await event(ev.id)).status).toBe(EventStatus.APPROVED);
    });

    it('US-42: confirming twice is refused the second time (409)', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A');

      await confirm(ev.id).expect(200);
      await confirm(ev.id).expect(409);
    });

    it('US-42 AC-1/AC-2: an event that is not ready gets 409 with the checklist', async () => {
      const ev = await seedEvent();
      await seedBooking(ev.id, 'Hall A', BookingStatus.REQUESTED);

      const res = await confirm(ev.id).expect(409);

      expect(res.body.items).toContainEqual({
        kind: 'VENUE',
        label: 'Venue booking at Hall A still pending',
        status: 'MISSING',
      });
      const row = await event(ev.id);
      expect(row.status).toBe(EventStatus.PLANNING);
      expect(row.arrangementsConfirmedAt).toBeNull();
      expect(await prisma.notification.count()).toBe(0);
    });

    it('US-42: a booking reverted while Confirm waits for the venue lock is caught by the re-check', async () => {
      const ev = await seedEvent();
      const booking = await seedBooking(ev.id, 'Hall A');

      // The checklist the Coordinator is looking at says ready.
      expect((await readiness(ev.id).expect(200)).body.ready).toBe(true);

      // Venue Staff reverse the approval, holding the venue lock (as
      // BookingsService.recordDecision does) while Confirm arrives.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => (locked = resolve));

      const reversal = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${booking.venueId}))`;
          await tx.venueBooking.update({
            where: { id: booking.id },
            data: { status: BookingStatus.REJECTED },
          });
          locked();
          await held;
        },
        { timeout: 10_000 },
      );

      await lockTaken;
      const confirming = confirm(ev.id).then((res) => res);
      // Give Confirm time to reach the lock and block on it.
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await reversal;

      const res = await confirming;
      expect(res.status).toBe(409);
      expect(outstanding(res.body)).toEqual(['No venue booked']);
      expect((await event(ev.id)).status).toBe(EventStatus.PLANNING);
    });
  });
});
