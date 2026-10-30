import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, PrismaClient, RoomLayout } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-53 e2e — one event, several venue bookings (Week 7 change 3). One
 * describe per acceptance criterion, named "US-53 AC-n".
 *
 * Code under test: BookingsService.request (per-venue timing and requirements,
 * defaults copied from the event), per-venue decisions, GET
 * /bookings/events/:id(/arrangement) and POST /bookings/:id/release.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * tc-s1-96-setup.sql (Vince, USR-013) and tc-s3-146-setup.sql (mainHall,
 * breakoutA, breakoutB and the "Summit" EVT-274).
 */
describe('US-53 multi-venue booking (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users, tc-s1-96-setup and tc-s3-146-setup. */
  const ids: Record<string, string> = {
    organiser: 'USR-006',
    coordinator: 'USR-004',
    otherCoordinator: 'USR-005',
    hallStaff: 'USR-010',
    roomStaff: 'USR-013',
    tech: 'USR-009',
    mainHall: 'VEN-076',
    breakoutA: 'VEN-077',
    breakoutB: 'VEN-078',
    summit: 'EVT-274',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    hallStaff: 'venue.staff@example.com',
    roomStaff: 'venue.staff2@example.com',
    tech: 'tech.support@example.com',
  };

  const at = (hhmm: string) => `2030-10-01T${hhmm}:00.000Z`;
  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const book = (venue: string, body: Record<string, unknown> = {}, who = 'coordinator') =>
    http()
      .post('/bookings')
      .set('Authorization', as(who))
      .send({
        eventId: ids.summit,
        venueId: ids[venue],
        start: at('09:00'),
        end: at('17:00'),
        expectedAttendance: 200,
        ...body,
      });

  const decide = (id: string, action: 'approve' | 'reject', who: string, body: object = {}) =>
    http().post(`/bookings/${id}/${action}`).set('Authorization', as(who)).send(body);

  const release = (id: string, who = 'coordinator') =>
    http().post(`/bookings/${id}/release`).set('Authorization', as(who));

  const arrangement = (who = 'coordinator', event = 'summit') =>
    http().get(`/bookings/events/${ids[event]}/arrangement`).set('Authorization', as(who));

  const eventBookings = (who = 'coordinator') =>
    http().get(`/bookings/events/${ids.summit}`).set('Authorization', as(who));

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
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-96-setup');
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
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-96-setup');
    await loadSql(prisma, 'tc-s3-146-setup');
  });

  describe('US-53 AC-1/AC-2: several bookings on one event, each with its own timing and requirements', () => {
    // TC-S3-146, TC-S3-147 · US-53 AC-1/AC-2 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if an event cannot hold several bookings, or each cannot have its own timing and requirements
    // Code: BookingsService.request (per-venue fields, defaults from the event)
    it('adds three bookings to one event with different times and requirements', async () => {
      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA', {
        start: at('13:00'),
        end: at('15:00'),
        expectedAttendance: 40,
        preferredLayout: RoomLayout.CLASSROOM,
        layoutNotes: 'Workshop tables',
        accessibilityRequirements: [],
        equipmentNeeds: 'Whiteboard',
      }).expect(201);
      const b = await book('breakoutB', {
        start: at('15:00'),
        end: at('16:30'),
        expectedAttendance: 25,
        preferredLayout: RoomLayout.BOARDROOM,
        equipmentNeeds: null,
      }).expect(201);

      // Defaults: copied from the event when not set.
      expect(hall.body).toMatchObject({
        start: at('09:00'),
        end: at('17:00'),
        expectedAttendance: 200,
        preferredLayout: 'THEATRE',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        equipmentNeeds: 'PA system',
      });
      // Set per venue.
      expect(a.body).toMatchObject({
        start: at('13:00'),
        end: at('15:00'),
        expectedAttendance: 40,
        preferredLayout: 'CLASSROOM',
        layoutNotes: 'Workshop tables',
        accessibilityRequirements: [],
        equipmentNeeds: 'Whiteboard',
      });
      // Partly set: unset fields still come from the event; null clears.
      expect(b.body).toMatchObject({
        preferredLayout: 'BOARDROOM',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        equipmentNeeds: null,
      });

      // All under the same event; the event itself is unchanged.
      expect(await prisma.venueBooking.count({ where: { eventId: ids.summit } })).toBe(3);
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.summit } });
      expect(event).toMatchObject({ preferredLayout: 'THEATRE', equipmentNeeds: 'PA system' });
    });

    // TC-S3-146, TC-S3-147 · US-53 AC-1/AC-2 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if an event cannot hold several bookings, or each cannot have its own timing and requirements
    // Code: BookingsService.request (per-venue fields, defaults from the event)
    it('rejects an unknown layout or accessibility value', async () => {
      await book('breakoutA', { preferredLayout: 'TREEHOUSE' }).expect(400);
      await book('breakoutA', { accessibilityRequirements: ['JETPACK'] }).expect(400);
    });
  });

  describe('US-53 AC-3: each venue goes through its own availability and conflict check', () => {
    // TC-S3-148 · US-53 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup + tc-s3-148-setup · fails if one venue's clash affects the others, the event's own bookings clash with each other, or a venue is decided by someone else's staff
    // Code: BookingsService.conflictsFor per venue; decide (venue manager only)
    it("one venue's clash refuses that request only; the event's others go ahead", async () => {
      // breakoutA is held by another event in the afternoon.
      await loadSql(prisma, 'tc-s3-148-setup'); // "Other" holds breakoutA 13:00-14:00
      await book('mainHall').expect(201);
      await book('breakoutA', { start: at('13:30'), end: at('15:00') }).expect(409);
      await book('breakoutB', { start: at('13:30'), end: at('15:00') }).expect(201);
    });

    // TC-S3-148 · US-53 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if one venue's clash affects the others, the event's own bookings clash with each other, or a venue is decided by someone else's staff
    // Code: BookingsService.conflictsFor per venue; decide (venue manager only)
    it("the event's own bookings at different venues never conflict with each other", async () => {
      await book('mainHall').expect(201);
      await book('breakoutA').expect(201); // same times, different venue
    });

    // TC-S3-148 · US-53 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if one venue's clash affects the others, the event's own bookings clash with each other, or a venue is decided by someone else's staff
    // Code: BookingsService.conflictsFor per venue; decide (venue manager only)
    it('each is decided independently by its own venue staff', async () => {
      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA').expect(201);

      // Hall staff cannot decide the breakout room, and vice versa.
      await decide(a.body.id, 'approve', 'hallStaff').expect(404);
      await decide(hall.body.id, 'approve', 'hallStaff').expect(200);
      await decide(a.body.id, 'reject', 'roomStaff', { reason: 'Closed for painting.' }).expect(200);

      // By id, not creation order, which can tie on createdAt.
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: hall.body.id } })).status).toBe(
        BookingStatus.APPROVED,
      );
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: a.body.id } })).status).toBe(
        BookingStatus.REJECTED,
      );
    });
  });

  describe('US-53 AC-4: each booking\'s approval status is shown separately on the event', () => {
    // TC-S3-149 · US-53 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if the event does not show each booking's own status, or another Coordinator sees them
    // Code: GET /bookings/events/:id
    it('lists every booking on the event with its own status and decision', async () => {
      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA').expect(201);
      await book('breakoutB').expect(201);
      await decide(hall.body.id, 'approve', 'hallStaff').expect(200);
      await decide(a.body.id, 'reject', 'roomStaff', { reason: 'Closed.' }).expect(200);

      const res = await eventBookings().expect(200);

      // Compared regardless of order: the list is ordered by createdAt, which
      // can tie for requests made in the same millisecond.
      expect(
        res.body
          .map((b: { venue: { name: string }; status: string; decisionReason: string | null }) => [
            b.venue.name,
            b.status,
            b.decisionReason,
          ])
          .sort(),
      ).toEqual(
        [
          ['mainHall', 'APPROVED', null],
          ['breakoutA', 'REJECTED', 'Closed.'],
          ['breakoutB', 'REQUESTED', null],
        ].sort(),
      );
    });

    // TC-S3-149 · US-53 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if the event does not show each booking's own status, or another Coordinator sees them
    // Code: GET /bookings/events/:id
    it('is not shown to another Coordinator', async () => {
      await book('mainHall').expect(201);
      await eventBookings('otherCoordinator').expect(200).expect([]);
    });
  });

  describe('US-53 AC-5: venue arranged only when all required venues are approved', () => {
    // TC-S3-150 · US-53 AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if the venue counts as arranged before every live booking is approved, or a rejected or released one still counts
    // Code: GET /bookings/events/:id/arrangement
    it('is false with no bookings, false until all approved, true after, false again on a new request', async () => {
      await arrangement().expect(200).expect((res) => expect(res.body.arranged).toBe(false));

      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA').expect(201);
      await decide(hall.body.id, 'approve', 'hallStaff').expect(200);
      expect((await arrangement().expect(200)).body).toEqual({
        arranged: false,
        activeBookings: 2,
        approvedBookings: 1,
        pendingBookings: 1,
      });

      await decide(a.body.id, 'approve', 'roomStaff').expect(200);
      expect((await arrangement().expect(200)).body).toEqual({
        arranged: true,
        activeBookings: 2,
        approvedBookings: 2,
        pendingBookings: 0,
      });

      await book('breakoutB').expect(201);
      expect((await arrangement().expect(200)).body.arranged).toBe(false);
    });

    // TC-S3-150 · US-53 AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if the venue counts as arranged before every live booking is approved, or a rejected or released one still counts
    // Code: GET /bookings/events/:id/arrangement
    it('does not count a rejected or released booking as required', async () => {
      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA').expect(201);
      const b = await book('breakoutB').expect(201);
      await decide(hall.body.id, 'approve', 'hallStaff').expect(200);
      await decide(a.body.id, 'reject', 'roomStaff', { reason: 'No.' }).expect(200);
      await release(b.body.id).expect(200);

      expect((await arrangement().expect(200)).body).toMatchObject({ arranged: true, activeBookings: 1 });
    });

    // TC-S3-150 · US-53 AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if the venue counts as arranged before every live booking is approved, or a rejected or released one still counts
    // Code: GET /bookings/events/:id/arrangement
    it("is refused for another Coordinator's event (404) and other roles (403)", async () => {
      await arrangement('otherCoordinator').expect(404);
      await arrangement('hallStaff').expect(403);
      await arrangement('organiser').expect(403);
    });
  });

  describe('US-53 AC-6: cancel or release one booking without affecting the others', () => {
    // TC-S3-151 · US-53 AC-6 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if releasing one booking affects the others or the event, deletes the record, or is allowed for the wrong user or status
    // Code: POST /bookings/:id/release
    it('releases one approved booking, keeps its record, and leaves the others and the event alone', async () => {
      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA').expect(201);
      await decide(hall.body.id, 'approve', 'hallStaff').expect(200);
      await decide(a.body.id, 'approve', 'roomStaff').expect(200);
      const eventBefore = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.summit } });
      const hallBefore = await prisma.venueBooking.findUniqueOrThrow({ where: { id: hall.body.id } });

      const res = await release(a.body.id).expect(200);

      expect(res.body).toMatchObject({ id: a.body.id, status: 'RELEASED', venueId: ids.breakoutA });
      expect(res.body.releasedAt).not.toBeNull();
      // The record is kept, with its decision history.
      const kept = await prisma.venueBooking.findUniqueOrThrow({
        where: { id: a.body.id },
        include: { decisions: true },
      });
      expect(kept.decisions).toHaveLength(1);
      // The other booking and the event are untouched.
      expect(await prisma.venueBooking.findUniqueOrThrow({ where: { id: hall.body.id } })).toEqual(hallBefore);
      expect(await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.summit } })).toEqual(eventBefore);
    });

    // TC-S3-151 · US-53 AC-6 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if releasing one booking affects the others or the event, deletes the record, or is allowed for the wrong user or status
    // Code: POST /bookings/:id/release
    it('cancels a pending request the same way', async () => {
      const a = await book('breakoutA').expect(201);

      await release(a.body.id).expect(200).expect((res) => expect(res.body.status).toBe('RELEASED'));
    });

    // TC-S3-151 · US-53 AC-6 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if releasing one booking affects the others or the event, deletes the record, or is allowed for the wrong user or status
    // Code: POST /bookings/:id/release
    it('frees the slot: the venue can be booked again for that time', async () => {
      const a = await book('breakoutA').expect(201);
      await decide(a.body.id, 'approve', 'roomStaff').expect(200);
      await release(a.body.id).expect(200);

      await book('breakoutA').expect(201);
    });

    // TC-S3-151 · US-53 AC-6 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if releasing one booking affects the others or the event, deletes the record, or is allowed for the wrong user or status
    // Code: POST /bookings/:id/release
    it('refuses to release a rejected or already released booking', async () => {
      const a = await book('breakoutA').expect(201);
      const b = await book('breakoutB').expect(201);
      await decide(a.body.id, 'reject', 'roomStaff', { reason: 'No.' }).expect(200);
      await release(b.body.id).expect(200);

      const rejected = await release(a.body.id).expect(409);
      expect(rejected.body.message).toBe('a rejected booking cannot be released');
      await release(b.body.id).expect(409);
    });

    // TC-S3-151 · US-53 AC-6 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if releasing one booking affects the others or the event, deletes the record, or is allowed for the wrong user or status
    // Code: POST /bookings/:id/release
    it("another Coordinator cannot release the event's booking (404); other roles get 403", async () => {
      const a = await book('breakoutA').expect(201);

      await release(a.body.id, 'otherCoordinator').expect(404);
      for (const who of ['roomStaff', 'organiser', 'tech']) {
        await release(a.body.id, who).expect(403);
      }
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: a.body.id } })).status).toBe(
        BookingStatus.REQUESTED,
      );
    });

    // TC-S3-151 · US-53 AC-6 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if releasing one booking affects the others or the event, deletes the record, or is allowed for the wrong user or status
    // Code: POST /bookings/:id/release
    it('US-52 interplay: a released booking no longer shows as needing a replacement', async () => {
      const a = await book('breakoutA').expect(201);
      await prisma.venueBooking.update({
        where: { id: a.body.id },
        data: { replacementNeededAt: new Date(), unavailableReason: 'Flood' },
      });
      const flagged = () =>
        http().get('/bookings/replacements-needed').set('Authorization', as('coordinator'));
      expect((await flagged().expect(200)).body).toHaveLength(1);

      await release(a.body.id).expect(200);

      await flagged().expect(200).expect([]);
    });

    // TC-S3-151 · US-53 AC-6 · setup: base-users + tc-s1-96-setup + tc-s3-146-setup · fails if releasing one booking affects the others or the event, deletes the record, or is allowed for the wrong user or status
    // Code: POST /bookings/:id/release
    it("another Coordinator cannot add a booking to the event (404)", async () => {
      await book('breakoutA', {}, 'otherCoordinator').expect(404);
    });
  });
});
