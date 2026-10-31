import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingDecisionKind, BookingStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { overlapsRange, windowsOverlap } from '../src/bookings/booking-overlap';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-51 e2e — flagging bookings that conflict after a buffer change.
 *
 * Code under test: VenuesService buffers preview/save (POST
 * /venues/:id/buffers/preview, PATCH /venues/:id/buffers with
 * confirmConflicts), recheckReviewFlags, and POST /bookings/:id/resolve-review.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * tc-s1-96-setup.sql (Vince, USR-013) and tc-s3-124-setup.sql (the Sandbox
 * Auditorium, VEN-065). Bookings come from the tc-s3-135/136/138 scripts.
 */
describe('US-51 flag bookings that conflict after buffer changes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users and tc-s1-96-setup. */
  const ids: Record<string, string> = {
    staffA: 'USR-010',
    staffB: 'USR-013',
    organiser: 'USR-006',
    coordinator: 'USR-004',
  };
  const LOGINS: Record<string, string> = {
    staffA: 'venue.staff@example.com',
    staffB: 'venue.staff2@example.com',
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
  };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);
  const CUSTOMER = { setupMinutes: 30, turnaroundMinutes: 45 };

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** The Sandbox Auditorium (tc-s3-124-setup). */
  const seedVenue = async () => ({ id: 'VEN-065' });

  /** The customer example: 10:00-12:00 and 12:30-14:00, fine until 30/45 (tc-s3-135-setup). */
  const customerPair = async (_venueId: string) => {
    await given('tc-s3-135-setup');
    return { morning: await booking('BKG-134'), lunch: await booking('BKG-135') };
  };

  const preview = (venueId: string, body: object, who = 'staffA') =>
    http().post(`/venues/${venueId}/buffers/preview`).set('Authorization', as(who)).send(body);

  const save = (venueId: string, body: object, who = 'staffA') =>
    http().patch(`/venues/${venueId}/buffers`).set('Authorization', as(who)).send(body);

  const booking = (id: string) => prisma.venueBooking.findUniqueOrThrow({ where: { id } });
  const buffers = (id: string) =>
    prisma.venue.findUniqueOrThrow({
      where: { id },
      select: { setupMinutes: true, turnaroundMinutes: true },
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
    await loadSql(prisma, 'tc-s3-124-setup');
  });

  describe('AC-1/AC-3: preview lists clashes before saving', () => {
    // TC-S3-137 · US-51 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if the preview misses a clash, lacks its event, time or partner, saves something, or reports touching windows
    // Code: POST /venues/:id/buffers/preview
    it('US-51: the customer example — both bookings are listed with what they clash with', async () => {
      const venue = await seedVenue();
      const { morning, lunch } = await customerPair(venue.id);

      const res = await preview(venue.id, CUSTOMER).expect(200);

      expect(res.body.clashes).toEqual([
        {
          bookingId: morning.id,
          eventName: 'Morning lecture',
          start: at('10:00').toISOString(),
          end: at('12:00').toISOString(),
          clashesWith: {
            bookingId: lunch.id,
            eventName: 'Lunch talk',
            start: at('12:30').toISOString(),
            end: at('14:00').toISOString(),
          },
        },
        expect.objectContaining({ bookingId: lunch.id, clashesWith: expect.objectContaining({ bookingId: morning.id }) }),
      ]);
    });

    // TC-S3-137 · US-51 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if the preview misses a clash, lacks its event, time or partner, saves something, or reports touching windows
    // Code: POST /venues/:id/buffers/preview
    it('US-51: preview saves nothing', async () => {
      const venue = await seedVenue();
      const { morning } = await customerPair(venue.id);

      await preview(venue.id, CUSTOMER).expect(200);

      expect(await buffers(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
      expect((await booking(morning.id)).needsReview).toBe(false);
    });

    // TC-S3-137 · US-51 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if the preview misses a clash, lacks its event, time or partner, saves something, or reports touching windows
    // Code: POST /venues/:id/buffers/preview
    it('US-51: with 0/0 buffers the customer example does not clash', async () => {
      const venue = await seedVenue();
      await customerPair(venue.id);

      const res = await preview(venue.id, { setupMinutes: 0, turnaroundMinutes: 0 }).expect(200);

      expect(res.body.clashes).toEqual([]);
    });

    // TC-S3-137 · US-51 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135b-setup · fails if the preview misses a clash, lacks its event, time or partner, saves something, or reports touching windows
    // Code: POST /venues/:id/buffers/preview
    it('US-51: padded windows that only touch do not clash', async () => {
      const venue = await seedVenue();
      await given('tc-s3-135b-setup'); // Morning lecture 10:00-12:00, Afternoon 13:15-14:00

      const res = await preview(venue.id, CUSTOMER).expect(200);

      expect(res.body.clashes).toEqual([]);
    });

    // TC-S3-137 · US-51 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup · fails if the preview misses a clash, lacks its event, time or partner, saves something, or reports touching windows
    // Code: POST /venues/:id/buffers/preview
    it('US-51: preview validates like the save (whole numbers 0-480)', async () => {
      const venue = await seedVenue();

      await preview(venue.id, { setupMinutes: 481, turnaroundMinutes: 0 }).expect(400);
    });
  });

  describe('AC-1/AC-2: what is re-checked', () => {
    // TC-S3-136 · US-51 AC-2 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-136-setup · fails if past bookings are re-checked
    // Code: recheck considers bookings ending after now only
    it('US-51 AC-2: past bookings are ignored', async () => {
      const venue = await seedVenue();
      await given('tc-s3-136-setup'); // the same pair on 1 Jan 2020

      const res = await preview(venue.id, CUSTOMER).expect(200);

      expect(res.body.clashes).toEqual([]);
    });

    // TC-S3-135 · US-51 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-136b-setup · fails if a rejected booking is re-checked
    // Code: recheck considers live statuses only
    it('US-51: REJECTED bookings are ignored', async () => {
      const venue = await seedVenue();
      await given('tc-s3-136b-setup'); // Morning lecture; Rejected talk 12:30-14:00 REJECTED

      const res = await preview(venue.id, CUSTOMER).expect(200);

      expect(res.body.clashes).toEqual([]);
    });

    // TC-S3-135 · US-51 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-136c-setup · fails if pending bookings are left out of the re-check
    // Code: recheck covers REQUESTED, HELD and APPROVED
    it('US-51: REQUESTED bookings are re-checked as well as APPROVED', async () => {
      const venue = await seedVenue();
      await given('tc-s3-136c-setup'); // Morning lecture REQUESTED; Lunch talk APPROVED

      const res = await preview(venue.id, CUSTOMER).expect(200);

      expect(res.body.clashes).toHaveLength(2);
    });

    // TC-S3-135 · US-51 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-136d-setup · fails if another venue's bookings are flagged
    // Code: recheck scoped to the venue
    it('US-51: bookings on another venue are untouched', async () => {
      const venue = await seedVenue();
      await given('tc-s3-136d-setup'); // the pair, on "Other Hall"
      const morning = await booking('BKG-142');

      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);

      expect((await booking(morning.id)).needsReview).toBe(false);
    });
  });

  describe('AC-4/AC-5/AC-6: cancel or save anyway', () => {
    // TC-S3-137 · US-51 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if a clashing change saves without confirmation
    // Code: PATCH /venues/:id/buffers -> 409 with the clashes
    it('US-51 AC-4: without confirmation, a clash is a 409 with the list, and nothing is saved', async () => {
      const venue = await seedVenue();
      const { morning, lunch } = await customerPair(venue.id);

      const res = await save(venue.id, CUSTOMER).expect(409);

      expect(res.body.clashes.map((c: { bookingId: string }) => c.bookingId).sort()).toEqual(
        [morning.id, lunch.id].sort(),
      );
      expect(await buffers(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
      expect((await booking(morning.id)).needsReview).toBe(false);
    });

    // TC-S3-138, TC-S3-139 · US-51 AC-4/AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if saving anyway does not flag the clashing bookings, or changes their times or status
    // Code: VenuesService.updateBuffers (confirmConflicts) -> flag needsReview, never cancel
    it('US-51 AC-5/AC-6: save anyway — buffers saved, both flagged, times and status unchanged', async () => {
      const venue = await seedVenue();
      const { morning, lunch } = await customerPair(venue.id);

      const res = await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);

      expect(res.body).toMatchObject({ ...CUSTOMER, flagged: 2 });
      expect(await buffers(venue.id)).toEqual(CUSTOMER);
      for (const original of [morning, lunch]) {
        const after = await booking(original.id);
        expect(after).toMatchObject({
          needsReview: true,
          start: original.start,
          end: original.end,
          status: original.status,
        });
        expect(after.needsReviewReason).toMatch(/30\/45/);
        expect(after.flaggedAt).toBeInstanceOf(Date);
      }
    });

    // TC-S3-140 · US-51 AC-6 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if a change with no clashes is not saved, or flags something
    // Code: VenuesService.updateBuffers
    it('US-51 AC-7: no clashes — saved, nothing flagged', async () => {
      const venue = await seedVenue();
      const { morning } = await customerPair(venue.id);

      const res = await save(venue.id, { setupMinutes: 10, turnaroundMinutes: 15 }).expect(200);

      expect(res.body).toMatchObject({ setupMinutes: 10, turnaroundMinutes: 15, flagged: 0 });
      expect((await booking(morning.id)).needsReview).toBe(false);
    });

    // TC-S3-137 · US-51 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup · fails if another Venue Staff member can preview or save
    // Code: VenuesService buffers (manager only, 404)
    it('US-51: other Venue Staff cannot preview or save (404)', async () => {
      const venue = await seedVenue();

      await preview(venue.id, CUSTOMER, 'staffB').expect(404);
      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }, 'staffB').expect(404);
    });
  });

  describe('AC-5: the flag shows in the queue and calendar', () => {
    // TC-S3-138 · US-51 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if the flag is missing from the queue or calendar
    // Code: BookingsService queue/calendar needsReview
    it('US-51: queue and calendar entries carry needsReview', async () => {
      const venue = await seedVenue();
      const { morning } = await customerPair(venue.id);
      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);

      const queue = await http()
        .get('/bookings/queue')
        .query({ view: 'decided', needsReview: 'true' })
        .set('Authorization', as('staffA'))
        .expect(200);
      expect(queue.body).toHaveLength(2);
      expect(queue.body.every((b: { needsReview: boolean }) => b.needsReview)).toBe(true);

      const calendar = await http()
        .get('/calendar')
        .query({ from: at('00:00').toISOString(), to: at('23:59').toISOString() })
        .set('Authorization', as('staffA'))
        .expect(200);
      const entry = calendar.body.entries.find((e: { id: string }) => e.id === morning.id);
      expect(entry).toMatchObject({ kind: 'CONFIRMED', needsReview: true });
      expect(entry.needsReviewReason).toMatch(/Lunch talk/);
    });
  });

  describe('resolution', () => {
    const flaggedPair = async () => {
      const venue = await seedVenue();
      const pair = await customerPair(venue.id);
      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);
      return { venue, ...pair };
    };

    const resolve = (id: string, who = 'staffA', body: object = {}) =>
      http().post(`/bookings/${id}/resolve-review`).set('Authorization', as(who)).send(body);

    // TC-S3-138 · US-51 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if a flag is not cleared when resolved (manually, or by the clash going away), or anyone else can resolve it
    // Code: POST /bookings/:id/resolve-review; recheckReviewFlags
    it('US-51: manual resolve clears the flag and writes a BookingDecision', async () => {
      const { morning } = await flaggedPair();

      await resolve(morning.id, 'staffA', { note: 'Agreed a shorter setup with both organisers' }).expect(200);

      const after = await booking(morning.id);
      expect(after).toMatchObject({
        needsReview: false,
        reviewResolvedById: ids.staffA,
        status: BookingStatus.APPROVED,
      });
      expect(after.reviewResolvedAt).toBeInstanceOf(Date);
      expect(await prisma.bookingDecision.findMany({ where: { bookingId: morning.id } })).toEqual([
        expect.objectContaining({
          kind: BookingDecisionKind.REVIEW_RESOLVED,
          outcome: BookingStatus.APPROVED,
          decidedById: ids.staffA,
          reason: 'Agreed a shorter setup with both organisers',
        }),
      ]);
    });

    // TC-S3-138 · US-51 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if a flag is not cleared when resolved (manually, or by the clash going away), or anyone else can resolve it
    // Code: POST /bookings/:id/resolve-review; recheckReviewFlags
    it('US-51: other Venue Staff get 404 and other roles 403; the flag stays', async () => {
      const { morning } = await flaggedPair();

      await resolve(morning.id, 'staffB').expect(404);
      await resolve(morning.id, 'coordinator').expect(403);
      await resolve(morning.id, 'organiser').expect(403);

      expect((await booking(morning.id)).needsReview).toBe(true);
    });

    // TC-S3-138 · US-51 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if a flag is not cleared when resolved (manually, or by the clash going away), or anyone else can resolve it
    // Code: POST /bookings/:id/resolve-review; recheckReviewFlags
    it('US-51: an unflagged booking cannot be resolved (409)', async () => {
      const venue = await seedVenue();
      const { morning } = await customerPair(venue.id);

      await resolve(morning.id).expect(409);
    });

    // TC-S3-138 · US-51 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-136c-setup · fails if a flag is not cleared when resolved (manually, or by the clash going away), or anyone else can resolve it
    // Code: POST /bookings/:id/resolve-review; recheckReviewFlags
    it('US-51: auto-clear — rejecting one booking of a clashing pair clears the other\'s flag', async () => {
      const venue = await seedVenue();
      await given('tc-s3-136c-setup'); // Morning lecture REQUESTED; Lunch talk APPROVED
      const morning = await booking('BKG-140');
      const lunch = await booking('BKG-141');
      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);

      await http()
        .post(`/bookings/${morning.id}/reject`)
        .set('Authorization', as('staffA'))
        .send({ reason: 'Clashes with the lunch talk' })
        .expect(200);

      const after = await booking(lunch.id);
      expect(after.needsReview).toBe(false);
      expect(after.reviewResolvedAt).toBeInstanceOf(Date);
      expect(after.reviewResolvedById).toBeNull();
      expect((await booking(morning.id)).needsReview).toBe(false);
    });

    // TC-S3-138 · US-51 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135-setup · fails if a flag is not cleared when resolved (manually, or by the clash going away), or anyone else can resolve it
    // Code: POST /bookings/:id/resolve-review; recheckReviewFlags
    it('US-51: auto-clear — reversing an approval to rejected clears the other\'s flag', async () => {
      const { morning, lunch } = await flaggedPair();

      await http()
        .post(`/bookings/${morning.id}/reverse`)
        .set('Authorization', as('staffA'))
        .send({ reason: 'Moved to another venue' })
        .expect(200);

      expect((await booking(lunch.id)).needsReview).toBe(false);
    });

    // TC-S3-138 · US-51 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-138b-setup + tc-s3-135-setup · fails if a flag is not cleared when resolved (manually, or by the clash going away), or anyone else can resolve it
    // Code: POST /bookings/:id/resolve-review; recheckReviewFlags
    it('US-51: auto re-check keeps a flag that still clashes with something else', async () => {
      const venue = await seedVenue();
      const { morning, lunch } = await customerPair(venue.id);
      await given('tc-s3-138b-setup'); // Afternoon seminar 14:30-16:00
      const late = await booking('BKG-144');
      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);

      await http()
        .post(`/bookings/${morning.id}/reverse`)
        .set('Authorization', as('staffA'))
        .send({ reason: 'Moved' })
        .expect(200);

      // lunch still clashes with the afternoon seminar (14:45 > 14:00).
      expect((await booking(lunch.id)).needsReview).toBe(true);
      expect((await booking(late.id)).needsReview).toBe(true);
    });
  });

  describe('windowsOverlap agrees with the Postgres overlap query', () => {
    // TC-S3-135 · US-51 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-135c-setup · fails if the in-memory clash rule disagrees with the database's
    // Code: booking-overlap.ts windowsOverlap / overlapsRange
    it.each([
      ['touching', at('12:00'), at('13:00'), false],
      ['overlapping by a minute', at('11:59'), at('13:00'), true],
      ['disjoint', at('13:00'), at('14:00'), false],
      ['containing', at('09:00'), at('13:00'), true],
    ])('US-51: %s', async (_label, start, end, expected) => {
      const venue = await seedVenue();
      await given('tc-s3-135c-setup'); // Morning lecture 10:00-12:00

      const inDb = await prisma.venueBooking.count({ where: { venueId: venue.id, ...overlapsRange(start, end) } });

      expect(inDb > 0).toBe(expected);
      expect(windowsOverlap({ start: at('10:00'), end: at('12:00') }, { start, end })).toBe(expected);
    });
  });
});
