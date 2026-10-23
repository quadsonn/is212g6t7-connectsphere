import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingDecisionKind, BookingStatus, NotificationType, PrismaClient, Role } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-22 (Story 22) — Venue Staff approve or reject a venue booking request,
 * with a reason. Integration tests, one describe per acceptance criterion.
 *
 * The code under test: POST /bookings/:id/approve | reject | reverse
 * (BookingsController) -> BookingsService.approve/reject/reverse, which all go
 * through recordDecision(). That method locks the venue, re-reads the booking,
 * checks the move is allowed (BOOKING_TRANSITIONS), re-runs the overlap check
 * when approving, then writes the new status and a BookingDecision row
 * (who, when, outcome, reason) in one transaction, and notifies the
 * Coordinator and the Organiser.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql, base-venues.sql and tc-s2-48-setup.sql
 * (one pending request on Main Hall); some tests then load a further tc-s2
 * script, as their test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 22 approve/reject a booking request with reason (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users: base-users.sql, plus tc-s2-01-setup.sql and tc-s2-52-setup.sql. */
  const USERS = {
    staff: 'venue.staff@example.com',
    staffB: 'venue.staff.b@example.com',
    coordinator: 'coord.a@example.com',
    organiser: 'organiser@example.com',
    organiserB: 'other.organiser@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed rows from tc-s2-48-setup.sql and tc-s2-55-setup.sql. */
  const BOOKING = { showcase: 'BKG-031', first: 'BKG-032', second: 'BKG-033' } as const;
  const EVENT = 'EVT-030';

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Approve, reject or reverse a booking as the given user (Venue Staff by default). */
  const act = (id: string, action: 'approve' | 'reject' | 'reverse', body: object = {}, who: keyof typeof USERS = 'staff') =>
    http().post(`/bookings/${id}/${action}`).set('Authorization', as(who)).send(body);

  const statusOf = async (id: string) => (await prisma.venueBooking.findUniqueOrThrow({ where: { id } })).status;

  /** Loads a test case's setup script(s) on top of the shared pre-condition. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    await resetDb(prisma);
    await given('base-users', 'tc-s2-01-setup', 'tc-s2-52-setup');
    for (const [key, email] of Object.entries(USERS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    // Leave the testDB empty, so files not yet converted to resetDb (which
    // delete only the tables they know) never trip over rows this file made.
    await resetDb(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('base-users', 'base-venues', 'tc-s2-48-setup');
  });

  // AC-1 (the actions are on the request detail view) and the "disabled/hidden"
  // part of AC-7 are about the screen: manual test case TC-S2-81.
  describe("access: only the venue's own Venue Staff can decide", () => {
    // TC-S2-48 · US-22 access · setup: base-users + base-venues + tc-s2-48-setup + tc-s2-01-setup · fails if another staff member's request, or a Coordinator, could decide it
    // Code: findDecidable() only finds bookings on venues the caller manages, so
    // another Venue Staff member gets 404; the permission matrix gives
    // Coordinators no decide action, so the guard answers 403.
    it("is refused for another staff member's venue (404) and for a Coordinator (403)", async () => {
      await given('tc-s2-01-setup');

      await act(BOOKING.showcase, 'approve', {}, 'staffB').expect(404);
      await act(BOOKING.showcase, 'approve', {}, 'coordinator').expect(403);
      expect(await statusOf(BOOKING.showcase)).toBe(BookingStatus.REQUESTED);
    });
  });

  describe('AC-2: rejecting requires a reason', () => {
    // TC-S2-49 · US-22 AC-2 · setup: base-users + base-venues + tc-s2-48-setup · fails if a rejection without a reason went through
    // Code: RejectBookingDto (@IsNotEmpty) refuses an empty reason with 400
    // before BookingsService.reject() runs, so the status is never touched.
    it('refuses a rejection without a reason, and changes nothing', async () => {
      const res = await act(BOOKING.showcase, 'reject', { reason: '' }).expect(400);

      expect(res.body.message).toContain('a reason is required to reject this booking request');
      expect(await statusOf(BOOKING.showcase)).toBe(BookingStatus.REQUESTED);
    });

    // TC-S2-49 · US-22 AC-2 · setup: base-users + base-venues + tc-s2-48-setup · fails if a reason of only spaces counted as a reason
    // Code: RejectBookingDto trims the reason (@Trim()) before @IsNotEmpty()
    // checks it, so '   ' is refused like an empty reason.
    it('US-22 AC-2: whitespace-only reject reason refused', async () => {
      const res = await act(BOOKING.showcase, 'reject', { reason: '   ' }).expect(400);

      expect(res.body.message).toContain('a reason is required to reject this booking request');
      expect(await statusOf(BOOKING.showcase)).toBe(BookingStatus.REQUESTED);
      expect(await prisma.bookingDecision.count({ where: { bookingId: BOOKING.showcase } })).toBe(0);
    });

    // TC-S2-49 · US-22 AC-2 · setup: base-users + base-venues + tc-s2-48-setup · fails if a reason with surrounding spaces were refused, or saved with the spaces
    // Code: @Trim() keeps the words and drops only the surrounding spaces.
    it('US-22 AC-2: a normal reason is still saved, trimmed', async () => {
      const res = await act(BOOKING.showcase, 'reject', { reason: '  Under maintenance  ' }).expect(200);

      expect(res.body).toMatchObject({ status: BookingStatus.REJECTED, decisionReason: 'Under maintenance' });
    });

    // TC-S2-49 · US-22 AC-2 · setup: base-users + base-venues + tc-s2-48-setup · fails if a rejection with a reason was refused, or the reason not saved
    // Code: reject() records REJECTED with the trimmed reason as decisionReason.
    it('rejects with a reason', async () => {
      const res = await act(BOOKING.showcase, 'reject', { reason: 'Under maintenance' }).expect(200);

      expect(res.body).toMatchObject({ status: BookingStatus.REJECTED, decisionReason: 'Under maintenance' });
    });
  });

  describe('AC-3: approving allows an optional note', () => {
    // TC-S2-50 · US-22 AC-3 · setup: base-users + base-venues + tc-s2-48-setup · fails if approving needed a note
    // Code: ApproveBookingDto's note is @IsOptional, so an empty body is valid.
    it('approves with no body at all', async () => {
      const res = await act(BOOKING.showcase, 'approve').expect(200);

      expect(res.body.status).toBe(BookingStatus.APPROVED);
    });

    // TC-S2-50 · US-22 AC-3 · setup: base-users + base-venues + tc-s2-48-setup · fails if a note given on approval was dropped
    // Code: approve() stores the note as the decision's reason and as decisionReason.
    it('approves with a note', async () => {
      const res = await act(BOOKING.showcase, 'approve', { note: 'Doors open 8am' }).expect(200);

      expect(res.body.decisionReason).toBe('Doors open 8am');
    });
  });

  describe('AC-4: the decision is timestamped and attributed', () => {
    // TC-S2-51 · US-22 AC-4 · setup: base-users + base-venues + tc-s2-48-setup · fails if a decision had no time or no named decider
    // Code: recordDecision() writes a BookingDecision row (decidedById, kind,
    // outcome, reason, createdAt) in the same transaction as the status change.
    it('returns a decision history entry naming the staff member', async () => {
      const res = await act(BOOKING.showcase, 'reject', { reason: 'Too small' }).expect(200);

      expect(res.body.decisions).toEqual([
        expect.objectContaining({
          kind: BookingDecisionKind.DECISION,
          outcome: BookingStatus.REJECTED,
          reason: 'Too small',
          createdAt: expect.any(String),
          decidedBy: expect.objectContaining({ id: 'USR-010', name: 'Vera Venue', role: Role.VENUE_STAFF }),
        }),
      ]);
      expect(Number.isNaN(Date.parse(res.body.decisions[0].createdAt))).toBe(false);
    });
  });

  describe('AC-5: the Coordinator and Organiser can see the decision', () => {
    // TC-S2-52 · US-22 AC-5 · setup: base-users + base-venues + tc-s2-48-setup · fails if the Coordinator or Organiser couldn't see the decision and reason, or weren't notified
    // Code: GET /bookings/events/:eventId lists an event's requests to its
    // Coordinator and Organiser; notifyDecision() sends both a
    // VENUE_BOOKING_DECIDED notification.
    it('shows it to both on GET /bookings/events/:eventId, and notifies both', async () => {
      await act(BOOKING.showcase, 'reject', { reason: 'Under maintenance' }).expect(200);

      for (const who of ['coordinator', 'organiser'] as const) {
        const res = await http().get(`/bookings/events/${EVENT}`).set('Authorization', as(who)).expect(200);

        expect(res.body[0]).toMatchObject({
          status: BookingStatus.REJECTED,
          decisionReason: 'Under maintenance',
          decisions: [expect.objectContaining({ reason: 'Under maintenance' })],
        });
      }

      const notified = await prisma.notification.findMany({ where: { type: NotificationType.VENUE_BOOKING_DECIDED } });
      expect(notified.map((n) => n.recipientId).sort()).toEqual(['USR-004', 'USR-006']);
    });

    // TC-S2-52 · US-22 AC-5 · setup: base-users + base-venues + tc-s2-48-setup + tc-s2-52-setup · fails if an unrelated Organiser could see the decision
    // Code: an Organiser's scope is OWN, so another Organiser's query matches no rows.
    it('hides it from an unrelated Organiser', async () => {
      await given('tc-s2-52-setup');
      await act(BOOKING.showcase, 'reject', { reason: 'Under maintenance' }).expect(200);

      const res = await http().get(`/bookings/events/${EVENT}`).set('Authorization', as('organiserB')).expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('AC-6: a reversal is a new recorded action', () => {
    // TC-S2-53 · US-22 AC-6 · setup: base-users + base-venues + tc-s2-48-setup · fails if reversing overwrote the original decision instead of adding to it
    // Code: reverse() flips APPROVED <-> REJECTED and records a REVERSAL row;
    // the earlier DECISION row is never updated.
    it('keeps the original decision and appends the reversal', async () => {
      await act(BOOKING.showcase, 'approve', { note: 'OK' }).expect(200);

      const res = await act(BOOKING.showcase, 'reverse', { reason: 'Venue flooded' }).expect(200);

      expect(res.body.status).toBe(BookingStatus.REJECTED);
      expect(res.body.decisions.map((d: { kind: string; outcome: string; reason: string }) => [d.kind, d.outcome, d.reason]))
        .toEqual([
          ['DECISION', 'APPROVED', 'OK'],
          ['REVERSAL', 'REJECTED', 'Venue flooded'],
        ]);
    });

    // TC-S2-53 · US-22 AC-6 · setup: base-users + base-venues + tc-s2-48-setup · fails if a decision could be reversed without saying why
    // Code: ReverseBookingDto (@IsNotEmpty) requires a reason.
    it('requires a reason to reverse', async () => {
      await act(BOOKING.showcase, 'approve').expect(200);

      await act(BOOKING.showcase, 'reverse', {}).expect(400);
      expect(await statusOf(BOOKING.showcase)).toBe(BookingStatus.APPROVED);
    });

    // TC-S2-49 · US-22 AC-2 · setup: base-users + base-venues + tc-s2-48-setup · fails if a reversal reason of only spaces counted as a reason
    // Code: ReverseBookingDto trims the reason (@Trim()) before @IsNotEmpty() checks it.
    it('US-22 AC-2: whitespace-only reverse reason refused', async () => {
      await act(BOOKING.showcase, 'approve').expect(200);

      const res = await act(BOOKING.showcase, 'reverse', { reason: '   ' }).expect(400);

      expect(res.body.message).toContain('a reason is required to reverse this decision');
      expect(await statusOf(BOOKING.showcase)).toBe(BookingStatus.APPROVED);
    });

    // TC-S2-49 · US-22 AC-2 · setup: base-users + base-venues + tc-s2-48-setup · fails if a reversal with a real reason were refused, or the reason not saved
    // Code: reverse() records the reversal with the trimmed reason.
    it('US-22 AC-2: a normal reverse reason is still saved', async () => {
      await act(BOOKING.showcase, 'approve').expect(200);

      const res = await act(BOOKING.showcase, 'reverse', { reason: '  Double-booked by mistake  ' }).expect(200);

      expect(res.body.status).toBe(BookingStatus.REJECTED);
      expect(res.body.decisions.at(-1)).toMatchObject({
        kind: BookingDecisionKind.REVERSAL,
        reason: 'Double-booked by mistake',
      });
    });

    // TC-S2-53 · US-22 AC-6 · setup: base-users + base-venues + tc-s2-48-setup · fails if a request nobody had decided yet could be "reversed"
    // Code: BOOKING_TRANSITIONS has no REVERSAL from REQUESTED, so canDecide() fails and the service answers 409.
    it('refuses to reverse a request that has not been decided (409)', async () => {
      await act(BOOKING.showcase, 'reverse', { reason: 'Changed my mind' }).expect(409);

      expect(await statusOf(BOOKING.showcase)).toBe(BookingStatus.REQUESTED);
      expect(await prisma.bookingDecision.count()).toBe(0);
    });

    // TC-S2-53 · US-22 AC-6 · setup: base-users + base-venues + tc-s2-55-setup · fails if reversing a rejection into an approval skipped the overlap check
    // Code: a reversal to APPROVED goes through the same recordDecision() path,
    // so the overlap check runs again and a now-taken slot is refused.
    it('re-checks the slot when a rejection is reversed into an approval', async () => {
      await given('tc-s2-55-setup');
      await act(BOOKING.first, 'reject', { reason: 'Clash' }).expect(200);
      await act(BOOKING.second, 'approve').expect(200);

      await act(BOOKING.first, 'reverse', { reason: 'Approve after all' }).expect(409);

      expect(await statusOf(BOOKING.first)).toBe(BookingStatus.REJECTED);
    });
  });

  describe('AC-7: the same request cannot be decided twice', () => {
    // TC-S2-54 · US-22 AC-7 · setup: base-users + base-venues + tc-s2-48-setup · fails if a decided request could be approved or rejected again
    // Code: a DECISION is only allowed from REQUESTED (BOOKING_TRANSITIONS), so a second one is 409 and writes no row.
    it('refuses a second approve or reject (409) and records nothing more', async () => {
      await act(BOOKING.showcase, 'approve').expect(200);

      await act(BOOKING.showcase, 'approve').expect(409);
      await act(BOOKING.showcase, 'reject', { reason: 'changed my mind' }).expect(409);
      expect(await prisma.bookingDecision.count({ where: { bookingId: BOOKING.showcase } })).toBe(1);
    });

    // TC-S2-54 · US-22 AC-7 · setup: base-users + base-venues + tc-s2-48-setup · fails if a double-click approved the same request twice
    // Code: recordDecision() locks the venue and re-reads the status under the
    // lock, so the second of two simultaneous approvals sees APPROVED and gets 409.
    it('lets only one of two simultaneous approvals through', async () => {
      const results = await Promise.all([act(BOOKING.showcase, 'approve'), act(BOOKING.showcase, 'approve')]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prisma.bookingDecision.count({ where: { bookingId: BOOKING.showcase } })).toBe(1);
    });
  });

  describe('approval checks the slot is still free (with Story 20 and Story 23)', () => {
    // TC-S2-55 · US-22 AC-3, US-23 AC-5 · setup: base-users + base-venues + tc-s2-55-setup · fails if two overlapping requests could both be approved
    // Code: approving re-runs the overlap check under the venue lock; an
    // APPROVED overlap is a hard conflict, answered 409 with the conflict named.
    it('refuses to approve a second, overlapping request', async () => {
      await given('tc-s2-55-setup');
      await act(BOOKING.first, 'approve').expect(200);

      const res = await act(BOOKING.second, 'approve').expect(409);

      expect(res.body.conflicts).toEqual([expect.objectContaining({ bookingId: BOOKING.first })]);
      expect(await statusOf(BOOKING.second)).toBe(BookingStatus.REQUESTED);
    });
  });
});
