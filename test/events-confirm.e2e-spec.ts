import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, EventStatus, NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-42 e2e — the Coordinator confirms an event once its arrangements are ready.
 *
 * Code under test: EventConfirmationService (readiness, confirm, manual
 * confirmation of free-text lines) and confirmation-readiness.rules.ts.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * tc-s3-70-setup.sql (the "Graduation showcase", EVT-203, in PLANNING, with
 * nothing booked). Each test loads the tc-s3 scripts its test case names (see
 * docs/testing/sprint3-test-cases.md).
 */
describe('US-42 confirm event when arrangements are ready (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users. */
  const ids: Record<string, string> = {
    coordinator: 'USR-004',
    otherCoordinator: 'USR-005',
    organiser: 'USR-006',
    staff: 'USR-010',
  };
  const LOGINS: Record<string, string> = {
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    organiser: 'organiser@example.com',
    staff: 'venue.staff@example.com',
  };
  /** The Graduation showcase (tc-s3-70-setup). */
  const EVENT = { id: 'EVT-203' } as const;

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

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
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
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
    await loadSql(prisma, 'tc-s3-70-setup');
  });

  describe('AC-1/AC-2: readiness checklist — venues', () => {
    // TC-S3-71 · US-42 AC-2 · setup: base-users + tc-s3-70-setup · fails if the checklist does not say no venue is booked
    // Code: EventConfirmationService.readiness -> confirmation-readiness.rules
    it('US-42 AC-2: no venue booked', async () => {
      const ev = EVENT;

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(outstanding(res.body)).toEqual(['No venue booked']);
    });

    // TC-S3-71 · US-42 AC-2 · setup: base-users + tc-s3-70-setup + tc-s3-71-setup · fails if a pending booking is not listed as outstanding
    // Code: EventConfirmationService.readiness -> confirmation-readiness.rules
    it('US-42 AC-2: one REQUESTED booking is still pending', async () => {
      const ev = EVENT;
      await given('tc-s3-71-setup'); // Hall A only requested

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(outstanding(res.body)).toEqual(['Venue booking at Hall A still pending']);
    });

    // TC-S3-71 · US-42 AC-2 · setup: base-users + tc-s3-70-setup + tc-s3-71b-setup · fails if a booking flagged for review counts as ready
    // Code: EventConfirmationService.readiness -> confirmation-readiness.rules
    it('US-42 AC-2: an APPROVED booking flagged for review needs conflict review', async () => {
      const ev = EVENT;
      await given('tc-s3-71b-setup'); // Room 2 approved but flagged for review

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(outstanding(res.body)).toEqual(['Venue booking at Room 2 needs conflict review']);
    });

    // TC-S3-70 · US-42 AC-1 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup + tc-s3-70c-setup · fails if one approved venue is enough while another is pending
    // Code: EventConfirmationService.readiness -> confirmation-readiness.rules
    it('US-42 AC-1: two venues with one pending is not ready', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup', 'tc-s3-70c-setup'); // Hall A approved, Room 2 pending

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(outstanding(res.body)).toEqual(['Venue booking at Room 2 still pending']);
    });

    // TC-S3-70 · US-42 AC-1 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup + tc-s3-70d-setup · fails if an event with every venue approved and no equipment is not ready, or a rejected booking still counts
    // Code: EventConfirmationService.readiness -> confirmation-readiness.rules
    it('US-42 AC-1: every booking APPROVED and no equipment is ready', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup', 'tc-s3-70d-setup'); // Hall A and Room 2 approved; Annex rejected

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
    // TC-S3-71 · US-42 AC-2 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup + tc-s3-71c-setup · fails if an under-reserved item is not listed with how many are missing
    // Code: EventConfirmationService.readiness -> confirmation-readiness.rules
    it('US-42 AC-2: a linked line under-reserved reads 1 of 2', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup', 'tc-s3-71c-setup'); // 2 projectors needed, 1 reserved

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(outstanding(res.body)).toEqual(['Projector not reserved (1 of 2)']);
    });

    // TC-S3-70 · US-42 AC-1 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup + tc-s3-70e-setup · fails if a reservation still awaiting approval counts as reserved
    // Code: EventConfirmationService.readiness -> confirmation-readiness.rules
    it('US-42: only a REQUESTED reservation does not satisfy the line', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup', 'tc-s3-70e-setup'); // 2 projectors needed, 2 only requested

      const res = await readiness(ev.id).expect(200);

      expect(outstanding(res.body)).toEqual(['Projector not reserved (0 of 2)']);
    });

    // TC-S3-71 · US-42 AC-2 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup + tc-s3-71d-setup · fails if a free-text item nobody checked counts as ready
    // Code: EventConfirmationService.readiness -> confirmation-readiness.rules
    it('US-42 AC-2: an unticked free-text line needs a manual check', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup', 'tc-s3-71d-setup'); // a free-text line, unticked

      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(false);
      expect(res.body.items).toContainEqual({
        kind: 'EQUIPMENT',
        label: 'Stage lighting rig - needs manual check',
        status: 'NEEDS_MANUAL_CHECK',
      });
    });

    // TC-S3-70 · US-42 AC-1 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup + tc-s3-70f-setup + tc-s3-71d-setup · fails if an event with everything reserved and checked is not ready
    // Code: EventConfirmationService.readiness -> confirmation-readiness.rules
    it('US-42: a fully reserved line and a ticked free-text line are ready', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup', 'tc-s3-70f-setup', 'tc-s3-71d-setup'); // projectors fully reserved; a free-text line
      const rig = { id: 'REQ-011' };

      await manualConfirm(ev.id, rig.id).expect(200);
      const res = await readiness(ev.id).expect(200);

      expect(res.body.ready).toBe(true);
    });

    // TC-S3-72 · US-42 AC-3 · setup: base-users + tc-s3-70-setup · fails if another Coordinator or the Organiser can read the checklist
    // Code: EventConfirmationService.readiness -> AccessControlService (404 / 403)
    it('US-42: readiness is for the assigned Coordinator only', async () => {
      const ev = EVENT;

      // Lead assignment story: another Coordinator cannot see the event at all.
      await readiness(ev.id, 'otherCoordinator').expect(404);
      await readiness(ev.id, 'organiser').expect(403);
    });
  });

  describe('manual confirmation of free-text lines', () => {
    // TC-S3-71 · US-42 AC-2 · setup: base-users + tc-s3-70-setup + tc-s3-71d-setup · fails if ticking a free-text item does not record who and when, or undo leaves it ticked
    // Code: EventConfirmationService.manualConfirm / undoManualConfirm
    it('US-42: ticking records who and when; undo clears it', async () => {
      const ev = EVENT;
      await given('tc-s3-71d-setup');
      const rig = { id: 'REQ-011' };

      const res = await manualConfirm(ev.id, rig.id).expect(200);
      expect(res.body.manuallyConfirmedById).toBe(ids.coordinator);
      expect(res.body.manuallyConfirmedAt).not.toBeNull();

      const undone = await undoManualConfirm(ev.id, rig.id).expect(200);
      expect(undone.body.manuallyConfirmedAt).toBeNull();
      expect(undone.body.manuallyConfirmedById).toBeNull();

      const row = await prisma.equipmentRequirement.findUniqueOrThrow({ where: { id: rig.id } });
      expect(row.manuallyConfirmedAt).toBeNull();
    });

    // TC-S3-72 · US-42 AC-3 · setup: base-users + tc-s3-70-setup + tc-s3-71d-setup · fails if someone other than the assigned Coordinator can tick an item
    // Code: EventConfirmationService.manualConfirm -> AccessControlService
    it('US-42: a Coordinator not assigned to the event cannot see it (404); its Organiser gets 403', async () => {
      const ev = EVENT;
      await given('tc-s3-71d-setup');
      const rig = { id: 'REQ-011' };

      await manualConfirm(ev.id, rig.id, 'otherCoordinator').expect(404);
      await undoManualConfirm(ev.id, rig.id, 'otherCoordinator').expect(404);
      await manualConfirm(ev.id, rig.id, 'organiser').expect(403);
    });

    // TC-S3-71 · US-42 AC-2 · setup: base-users + tc-s3-70-setup + tc-s3-71c-setup · fails if a catalogue item can be ticked instead of reserved
    // Code: EventConfirmationService.manualConfirm: free-text lines only
    it('US-42: a catalogue-linked line cannot be ticked (400)', async () => {
      const ev = EVENT;
      await given('tc-s3-71c-setup');
      const line = { id: 'REQ-009' }; // a catalogue-linked line

      await manualConfirm(ev.id, line.id).expect(400);
      await undoManualConfirm(ev.id, line.id).expect(400);
    });

    // TC-S3-71 · US-42 AC-2 · setup: base-users + tc-s3-70-setup + tc-s3-71e-setup · fails if an item of another event can be ticked through this one
    // Code: EventConfirmationService.manualConfirm scopes the line to the event
    it('US-42: a line from another event is not found', async () => {
      const ev = EVENT;
      await given('tc-s3-71e-setup');
      const rig = { id: 'REQ-013' }; // belongs to another event

      await manualConfirm(ev.id, rig.id).expect(404);
    });

    // TC-S3-71 · US-42 AC-2 · setup: base-users + tc-s3-70-setup + tc-s3-71d-setup · fails if editing the requirements clears a tick on an unchanged item
    // Code: EventsService.setTechnicalRequirements keeps unchanged rows
    it('US-42: a tick survives an edit that leaves the line unchanged', async () => {
      const ev = EVENT;
      await given('tc-s3-71d-setup');
      const rig = { id: 'REQ-011' };
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
    // TC-S3-73 · US-42 AC-4 · setup: base-users + tc-s3-70-setup + tc-s3-73b-setup + tc-s3-70b-setup · fails if confirming does not change the status or record who and when
    // Code: EventConfirmationService.confirm -> setStatus(AWAITING_SAFETY_CHECK)
    it('US-42 AC-4: a ready event moves to AWAITING_SAFETY_CHECK with who and when', async () => {
      await given('tc-s3-73b-setup');
      const ev = EVENT;
      await given('tc-s3-70b-setup'); // Hall A approved
      const before = Date.now();

      const res = await confirm(ev.id).expect(200);

      expect(res.body.status).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      const row = await event(ev.id);
      expect(row.status).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      expect(row.arrangementsConfirmedById).toBe(ids.coordinator);
      expect(row.arrangementsConfirmedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    // TC-S3-73 · US-42 AC-4 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup · fails if an event in planning cannot be confirmed
    // Code: EventConfirmationService.confirm
    it('US-42: confirming works from PLANNING too', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup'); // Hall A approved

      await confirm(ev.id).expect(200);

      expect((await event(ev.id)).status).toBe(EventStatus.AWAITING_SAFETY_CHECK);
    });

    // TC-S3-74 · US-42 AC-5 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup · fails if the Organiser is not told, or cannot see the confirmation
    // Code: EventConfirmationService.confirm -> notifySafely; EventsService.findMyRequest
    it('US-42 AC-5: the Organiser is notified and sees the new status', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup'); // Hall A approved

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

    // TC-S3-72 · US-42 AC-3 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup · fails if someone other than the assigned Coordinator can confirm
    // Code: EventConfirmationService.confirm -> AccessControlService
    it('US-42 AC-3: a Coordinator not assigned to the event cannot confirm it (404: they cannot see it)', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup'); // Hall A approved

      await confirm(ev.id, 'otherCoordinator').expect(404);
      await confirm(ev.id, 'organiser').expect(403);

      expect((await event(ev.id)).status).toBe(EventStatus.PLANNING);
    });

    // TC-S3-73 · US-42 AC-4 · setup: base-users + tc-s3-70-setup + tc-s3-73c-setup + tc-s3-70b-setup · fails if an event not yet in planning can be confirmed
    // Code: EventConfirmationService.confirm status check
    it('US-42: an event that is not in planning cannot be confirmed (409)', async () => {
      await given('tc-s3-73c-setup');
      const ev = EVENT;
      await given('tc-s3-70b-setup'); // Hall A approved

      await confirm(ev.id).expect(409);

      expect((await event(ev.id)).status).toBe(EventStatus.APPROVED);
    });

    // TC-S3-73 · US-42 AC-4 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup · fails if an event can be confirmed twice
    // Code: setStatus transition table
    it('US-42: confirming twice is refused the second time (409)', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup'); // Hall A approved

      await confirm(ev.id).expect(200);
      await confirm(ev.id).expect(409);
    });

    // TC-S3-70, TC-S3-71 · US-42 AC-1/AC-2 · setup: base-users + tc-s3-70-setup + tc-s3-71-setup · fails if an event that is not ready can be confirmed through the API, or the refusal hides what is missing
    // Code: EventConfirmationService.confirm re-checks readiness
    it('US-42 AC-1/AC-2: an event that is not ready gets 409 with the checklist', async () => {
      const ev = EVENT;
      await given('tc-s3-71-setup'); // Hall A only requested

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

    // TC-S3-70 · US-42 AC-1 · setup: base-users + tc-s3-70-setup + tc-s3-70b-setup · fails if a booking reversed while Confirm is in progress is missed
    // Code: EventConfirmationService.confirm locks the venues, then re-checks
    it('US-42: a booking reverted while Confirm waits for the venue lock is caught by the re-check', async () => {
      const ev = EVENT;
      await given('tc-s3-70b-setup');
      const booking = { id: 'BKG-089', venueId: 'VEN-057' }; // Hall A, approved

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
