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

const DAY = 24 * 60 * 60 * 1000;

/**
 * US-65 e2e — the Organiser who cancels an event gets their own confirmation,
 * through the real cancel endpoint (US-43): what was released and the reason
 * they gave. The Coordinator and Attendees keep the notice US-43 sends them.
 */
describe('US-65 cancellation confirmation for the Organiser (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, role: Role, name = key) => {
    const email = `${key.toLowerCase()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 4), name, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const start = new Date(Date.now() + 30 * DAY);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);

  /** A confirmed event holding one venue booking, two equipment reservations and one registration. */
  const seedHeldEvent = async () => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name: 'Careers Fair',
        purpose: 'Meet employers',
        description: 'Stalls and talks',
        category: 'Careers',
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: 150,
        status: EventStatus.CONFIRMED,
      },
    });
    await prisma.venueBooking.create({
      data: {
        eventId: event.id,
        venueId: ids.venue,
        start,
        end,
        status: BookingStatus.APPROVED,
        requestedById: ids.coordinator,
      },
    });
    for (const quantity of [2, 3]) {
      await prisma.equipmentReservation.create({
        data: {
          eventId: event.id,
          equipmentId: ids.mic,
          quantity,
          start,
          end,
          status: ReservationStatus.APPROVED,
        },
      });
    }
    await prisma.registration.create({
      data: { eventId: event.id, attendeeId: ids.attendee, phone: '+6591234567' },
    });
    return event;
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
    await prisma.registration.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venueBlock.deleteMany();
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipmentRequirement.deleteMany();
    await prisma.eventChangeRequest.deleteMany();
    await prisma.eventChange.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', Role.EVENT_ORGANISER, 'Priya');
    await seedUser('coordinator', Role.EVENT_COORDINATOR, 'Marcus');
    await seedUser('venueStaff', Role.VENUE_STAFF);
    await seedUser('attendee', Role.ATTENDEE);

    const venue = await prisma.venue.create({
      data: {
        name: 'Main Hall',
        location: 'Student Centre',
        capacity: 200,
        status: VenueStatus.PUBLISHED,
        managedById: ids.venueStaff,
      },
    });
    ids.venue = venue.id;

    const mic = await prisma.equipment.create({
      data: { type: 'Wireless microphone', totalQuantity: 10 },
    });
    ids.mic = mic.id;
  });

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

  it('AC2: Given the Organiser is also registered as an attendee, When they cancel, Then they get exactly one notice', async () => {
    const event = await seedHeldEvent();
    // Only Attendees may register through the API; a row like this can still
    // exist in the data, and the Organiser must not be told twice.
    await prisma.registration.create({
      data: { eventId: event.id, attendeeId: ids.organiser, phone: '+6598765432' },
    });

    const res = await cancel(event.id).expect(200);

    const own = (await cancellationNotices(event.id)).filter((n) => n.recipientId === ids.organiser);
    expect(own).toHaveLength(1);
    expect(own[0].message).toMatch(/^You cancelled "Careers Fair"\./);
    expect(res.body.notified).toBe(2);
  });

  it('sends nothing when the cancellation is refused', async () => {
    const event = await seedHeldEvent();
    await prisma.eventRequest.update({ where: { id: event.id }, data: { status: EventStatus.COMPLETED } });

    await cancel(event.id).expect(409);

    expect(await cancellationNotices(event.id)).toEqual([]);
  });
});
