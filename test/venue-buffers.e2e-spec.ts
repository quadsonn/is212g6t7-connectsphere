import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { overlapsRange, paddedRange } from '../src/bookings/booking-overlap';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-49 e2e — configuring a venue's setup and turnaround time.
 *
 * Code under test: VenuesService.updateBuffers (PATCH /venues/:id/buffers,
 * VenueBuffersDto) and booking-overlap.ts paddedRange/overlapsRange.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * tc-s1-96-setup.sql (Vince, USR-013) and tc-s3-124-setup.sql (the Sandbox
 * Auditorium, VEN-065, saved without buffers).
 */
describe('US-49 venue setup and turnaround time (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const LOGINS: Record<string, string> = {
    staffA: 'venue.staff@example.com',
    staffB: 'venue.staff2@example.com',
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    attendee: 'attendee@example.com',
  };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** The Sandbox Auditorium (tc-s3-124-setup), after any variant scripts. */
  const seedVenue = async (...scripts: string[]) => {
    await given(...scripts);
    return { id: 'VEN-065' };
  };

  const patchBuffers = (id: string, body: unknown, who = 'staffA') =>
    http().patch(`/venues/${id}/buffers`).set('Authorization', as(who)).send(body as object);

  const stored = async (id: string) =>
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

  describe('AC-2: existing venues default to 0', () => {
    // TC-S3-125 · US-49 AC-2 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup · fails if a venue saved without buffers gets anything but 0 and 0
    // Code: Venue setupMinutes/turnaroundMinutes @default(0)
    it('US-49: a venue saved without buffers has 0 setup and 0 turnaround', async () => {
      const venue = await seedVenue();

      expect(await stored(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
    });
  });

  describe('AC-1/AC-5: editable, and shown on the details page', () => {
    // TC-S3-124, TC-S3-128 · US-49 AC-1/AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup · fails if the managing Venue Staff cannot set the buffers, or the details page does not show them
    // Code: VenuesService.updateBuffers (PATCH /venues/:id/buffers); GET /venues/:id
    it.each([0, 30, 480])('US-49: accepts %p minutes and saves it', async (minutes) => {
      const venue = await seedVenue();

      const res = await patchBuffers(venue.id, {
        setupMinutes: minutes,
        turnaroundMinutes: minutes,
      }).expect(200);

      expect(res.body).toMatchObject({ setupMinutes: minutes, turnaroundMinutes: minutes });
      expect(await stored(venue.id)).toEqual({ setupMinutes: minutes, turnaroundMinutes: minutes });
    });

    // TC-S3-124, TC-S3-128 · US-49 AC-1/AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup · fails if the managing Venue Staff cannot set the buffers, or the details page does not show them
    // Code: VenuesService.updateBuffers (PATCH /venues/:id/buffers); GET /venues/:id
    it('US-49: the venue detail response includes the saved values', async () => {
      const venue = await seedVenue();
      await patchBuffers(venue.id, { setupMinutes: 30, turnaroundMinutes: 45 }).expect(200);

      for (const who of ['staffA', 'coordinator']) {
        const res = await http()
          .get(`/venues/${venue.id}`)
          .set('Authorization', as(who))
          .expect(200);

        expect(res.body).toMatchObject({ setupMinutes: 30, turnaroundMinutes: 45 });
      }
    });

    // TC-S3-124, TC-S3-128 · US-49 AC-1/AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-124b-setup · fails if the managing Venue Staff cannot set the buffers, or the details page does not show them
    // Code: VenuesService.updateBuffers (PATCH /venues/:id/buffers); GET /venues/:id
    it('US-49: a draft venue can be configured too', async () => {
      const venue = await seedVenue('tc-s3-124b-setup'); // still a draft

      await patchBuffers(venue.id, { setupMinutes: 15, turnaroundMinutes: 20 }).expect(200);

      expect(await stored(venue.id)).toEqual({ setupMinutes: 15, turnaroundMinutes: 20 });
    });

    // TC-S3-124, TC-S3-128 · US-49 AC-1/AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup · fails if the managing Venue Staff cannot set the buffers, or the details page does not show them
    // Code: VenuesService.updateBuffers (PATCH /venues/:id/buffers); GET /venues/:id
    it('US-49: the general venue edit does not change buffers (one write path)', async () => {
      const venue = await seedVenue();

      await http()
        .patch(`/venues/${venue.id}`)
        .set('Authorization', as('staffA'))
        .send({ setupMinutes: 30, turnaroundMinutes: 45 })
        .expect(200);

      expect(await stored(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
    });
  });

  describe('AC-3: only whole numbers 0-480', () => {
    // TC-S3-126 · US-49 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-126-setup · fails if a value outside 0-480, a fraction, text or a missing value is saved
    // Code: VenueBuffersDto (@IsInt @Min(0) @Max(480))
    it.each([
      ['-1', { setupMinutes: -1, turnaroundMinutes: 30 }],
      ['481', { setupMinutes: 30, turnaroundMinutes: 481 }],
      ['1.5', { setupMinutes: 1.5, turnaroundMinutes: 30 }],
      ['"abc"', { setupMinutes: 'abc', turnaroundMinutes: 30 }],
      ['a missing setup value', { turnaroundMinutes: 30 }],
      ['a missing turnaround value', { setupMinutes: 30 }],
      ['an empty body', {}],
    ])('US-49: rejects %s with 400 and saves nothing', async (_label, body) => {
      const venue = await seedVenue('tc-s3-126-setup'); // 10-minute buffers already

      const res = await patchBuffers(venue.id, body).expect(400);

      expect(Array.isArray(res.body.message)).toBe(true);
      expect(await stored(venue.id)).toEqual({ setupMinutes: 10, turnaroundMinutes: 10 });
    });
  });

  describe('AC-4: only the managing Venue Staff can edit', () => {
    // TC-S3-127 · US-49 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup · fails if someone other than the venue's manager can change its buffers
    // Code: VenuesService.updateBuffers (manager only, 404); @Roles(VENUE_STAFF)
    it('US-49: other Venue Staff get 404 (not 403, so the venue is not confirmed to exist) and nothing is saved', async () => {
      const venue = await seedVenue();

      await patchBuffers(venue.id, { setupMinutes: 30, turnaroundMinutes: 45 }, 'staffB').expect(404);

      expect(await stored(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
    });

    // TC-S3-127 · US-49 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup · fails if someone other than the venue's manager can change its buffers
    // Code: VenuesService.updateBuffers (manager only, 404); @Roles(VENUE_STAFF)
    it.each(['organiser', 'coordinator', 'attendee'])(
      'US-49: %s gets 403 and nothing is saved',
      async (who) => {
        const venue = await seedVenue();

        await patchBuffers(venue.id, { setupMinutes: 30, turnaroundMinutes: 45 }, who).expect(403);

        expect(await stored(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
      },
    );

    // TC-S3-127 · US-49 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup · fails if someone other than the venue's manager can change its buffers
    // Code: VenuesService.updateBuffers (manager only, 404); @Roles(VENUE_STAFF)
    it('US-49: an unauthenticated request gets 401', async () => {
      const venue = await seedVenue();

      await http()
        .patch(`/venues/${venue.id}/buffers`)
        .send({ setupMinutes: 30, turnaroundMinutes: 45 })
        .expect(401);
    });
  });

  /**
   * paddedRange composed with the one shared overlap rule, run as a real
   * Postgres query. A booking row is stored with an already-padded window
   * purely to exercise the rule; applying buffers to real bookings is US-50.
   */
  describe('paddedRange with the shared half-open overlap rule', () => {
    const at = (time: string) => new Date(`2030-10-01T${time}:00Z`);

    /** BKG-119: 10:00-12:00 padded 30/45, stored as 09:30-12:45 (tc-s3-129-setup). */
    const storePadded = async (_venueId: string, _window: { start: Date; end: Date }) => {
      await given('tc-s3-129-setup');
    };

    const overlapsPadded = async (venueId: string, window: { start: Date; end: Date }) =>
      prisma.venueBooking.count({ where: { venueId, ...overlapsRange(window.start, window.end) } });

    // TC-S3-129 · US-49 AC-6 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-129-setup · fails if the saved buffers are not applied the same way the availability and conflict checks apply them
    // Code: booking-overlap.ts paddedRange + overlapsRange (half-open)
    it('US-49: two padded windows that only touch at a boundary do not overlap', async () => {
      const venue = await seedVenue();
      // 10:00-12:00 padded 30/45 -> 09:30-12:45.
      await storePadded(venue.id, paddedRange(at('10:00'), at('12:00'), 30, 45));

      // 13:15-14:00 padded 30/45 -> 12:45-14:45: touches at 12:45.
      expect(await overlapsPadded(venue.id, paddedRange(at('13:15'), at('14:00'), 30, 45))).toBe(0);
    });

    // TC-S3-129 · US-49 AC-6 · setup: base-users + tc-s1-96-setup + tc-s3-124-setup + tc-s3-129-setup · fails if the saved buffers are not applied the same way the availability and conflict checks apply them
    // Code: booking-overlap.ts paddedRange + overlapsRange (half-open)
    it('US-49: padded windows that share even a minute do overlap', async () => {
      const venue = await seedVenue();
      await storePadded(venue.id, paddedRange(at('10:00'), at('12:00'), 30, 45));

      // 13:14 start padded by 30 -> 12:44, one minute inside 09:30-12:45.
      expect(await overlapsPadded(venue.id, paddedRange(at('13:14'), at('14:00'), 30, 45))).toBe(1);
    });
  });
});
