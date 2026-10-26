import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-14 (Update a venue's details as facilities change), integration tests:
 * the real Nest app over HTTP (Supertest) and the local test database, one
 * describe per acceptance criterion.
 *
 * Code under test: PATCH /venues/:id (@Roles VENUE_STAFF) ->
 * VenuesService.updateDraft(). It loads the venue through findManaged() (the
 * managing Venue Staff member only, 404 otherwise), refuses to blank a required
 * field on a PUBLISHED venue, writes only the fields sent, and, when capacity
 * drops or a layout, accessibility feature or the location is withdrawn, looks
 * up live bookings (BookingsService.findLiveBookingsForVenue: not finished, not
 * rejected) and returns a BOOKINGS_MAY_NEED_REVIEW warning plus a notification.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql + base-venues.sql (VEN-002 Main Hall,
 * VEN-038 Seminar Room, VEN-004 Rooftop Terrace, all published, and the draft
 * VEN-001, all managed by USR-010) + tc-s1-96-setup.sql (a second Venue Staff
 * member). AC-3 also runs tc-s1-105-setup.sql (an upcoming booking on Main
 * Hall, a finished one on Seminar Room, a rejected one on Rooftop Terrace).
 */
describe('US-14 update an existing venue (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const USERS = {
    staffA: 'venue.staff@example.com', // USR-010, manages every base venue
    staffB: 'venue.staff2@example.com', // USR-013, tc-s1-96-setup
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
  } as const;
  type Who = keyof typeof USERS;
  const MAIN_HALL = 'VEN-002';
  const SEMINAR_ROOM = 'VEN-038';
  const ROOFTOP = 'VEN-004';
  const DRAFT = 'VEN-001';

  const tokens: Record<string, string> = {};
  const as = (who: Who) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };
  const patch = (id: string, body: Record<string, unknown>, who: Who = 'staffA') =>
    http().patch(`/venues/${id}`).set('Authorization', as(who)).send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    await resetDb(prisma);
    await given('base-users', 'tc-s1-96-setup');
    for (const [key, email] of Object.entries(USERS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('base-users', 'base-venues', 'tc-s1-96-setup');
  });

  describe('AC-1: any detail can be edited', () => {
    // TC-S1-103 · US-14 AC-1 · setup: base-users + base-venues + tc-s1-96-setup · fails if any detail the AC names could not be changed on an existing venue
    // Code: updateDraft() writes capacity, facilities, accessibilityFeatures, supportedLayouts and operatingInfo as sent.
    it('edits capacity, facilities, accessibility, layouts and hours', async () => {
      const res = await patch(MAIN_HALL, {
        capacity: 500,
        facilities: ['STAGE', 'SOUND_SYSTEM'],
        accessibilityFeatures: ['STEP_FREE_ACCESS', 'HEARING_LOOP', 'ACCESSIBLE_RESTROOMS'],
        supportedLayouts: ['THEATRE', 'BANQUET', 'CLASSROOM'],
        operatingInfo: '7:00 AM – 11:00 PM',
      }).expect(200);

      expect(res.body).toMatchObject({
        capacity: 500,
        facilities: ['STAGE', 'SOUND_SYSTEM'],
        accessibilityFeatures: ['STEP_FREE_ACCESS', 'HEARING_LOOP', 'ACCESSIBLE_RESTROOMS'],
        supportedLayouts: ['THEATRE', 'BANQUET', 'CLASSROOM'],
        operatingInfo: '7:00 AM – 11:00 PM',
      });
    });

    // TC-S1-103 · US-14 AC-1 · setup: base-users + base-venues + tc-s1-96-setup · fails if the name and location could not be edited too ("any details")
    // Code: the same VenueDraftDto serves create and edit, so every field is editable.
    it('edits the name and location', async () => {
      const res = await patch(MAIN_HALL, { name: 'Main Hall (renovated)', location: 'Block A, Level 2' }).expect(200);

      expect(res.body).toMatchObject({ name: 'Main Hall (renovated)', location: 'Block A, Level 2' });
    });

    // TC-S1-103 · US-14 AC-1, US-06 · setup: base-users + base-venues + tc-s1-96-setup · fails if an edit could add a layout outside the shared list
    // Code: supportedLayouts is @IsEnum(RoomLayout, { each: true }) (400 otherwise).
    it('rejects a layout outside the shared vocabulary', async () => {
      await patch(MAIN_HALL, { supportedLayouts: ['CABARET'] }).expect(400);
    });

    // TC-S1-103 · US-14 AC-1, US-02 · setup: base-users + base-venues + tc-s1-96-setup · fails if a role other than Venue Staff could edit a venue
    // Code: PATCH /venues/:id is @Roles(VENUE_STAFF); RolesGuard answers 403.
    it.each(['coordinator', 'organiser'] as const)('refuses %s at the role gate', async (who) => {
      await patch(MAIN_HALL, { capacity: 1 }, who).expect(403);
    });

    // TC-S1-103 · US-14 AC-1 · setup: base-users + base-venues + tc-s1-96-setup · fails if a Venue Staff member could edit a venue someone else manages
    // Code: findManaged() matches managedById; another manager's venue is 404 and unchanged.
    it('refuses another manager’s venue', async () => {
      await patch(MAIN_HALL, { capacity: 1 }, 'staffB').expect(404);

      expect((await prisma.venue.findUniqueOrThrow({ where: { id: MAIN_HALL } })).capacity).toBe(300);
    });
  });

  describe('AC-2: the change persists and the catalogue reflects it', () => {
    // TC-S1-104 · US-14 AC-2 · setup: base-users + base-venues + tc-s1-96-setup · fails if a Coordinator's next load of the catalogue showed the old value
    // Code: GET /venues reads the database on every call (Cache-Control: no-store).
    it('is visible to a Coordinator on next load', async () => {
      await patch(MAIN_HALL, { capacity: 999 }).expect(200);

      const catalogue = await http()
        .get('/venues')
        .set('Authorization', as('coordinator'))
        .expect(200);

      const hall = catalogue.body.find((v: { id: string }) => v.id === MAIN_HALL);
      expect(hall.capacity).toBe(999);
    });

    // TC-S1-104 · US-14 AC-2 · setup: base-users + base-venues + tc-s1-96-setup · fails if a saved change was not written to the database
    // Code: updateDraft() -> prisma.venue.update().
    it('persists to the database', async () => {
      await patch(MAIN_HALL, { operatingInfo: 'Weekends only' }).expect(200);

      const stored = await prisma.venue.findUniqueOrThrow({ where: { id: MAIN_HALL } });
      expect(stored.operatingInfo).toBe('Weekends only');
    });

    // TC-S1-104 · US-14 AC-2 · setup: base-users + base-venues + tc-s1-96-setup · fails if editing one detail wiped the others
    // Code: updateDraft() writes only the fields in the body (draftFields() keeps the keys present).
    it('leaves the details it did not touch as they were', async () => {
      await patch(MAIN_HALL, { capacity: 350 }).expect(200);

      const stored = await prisma.venue.findUniqueOrThrow({ where: { id: MAIN_HALL } });
      expect(stored).toMatchObject({
        name: 'Main Hall',
        location: 'Block A, Level 1',
        supportedLayouts: ['THEATRE', 'BANQUET'],
        operatingInfo: '8:00 AM – 10:00 PM',
      });
    });
  });

  describe('AC-3: warning when existing bookings may be affected', () => {
    // TC-S1-105 · US-14 AC-3 · setup: base-users + base-venues + tc-s1-96-setup + tc-s1-105-setup · fails if reducing capacity under an upcoming booking gave no warning, or named the wrong bookings
    // Code: assessBookingImpact() compares before/after; findLiveBookingsForVenue() returns BKG-001 -> BOOKINGS_MAY_NEED_REVIEW.
    it('warns when capacity is reduced on a venue with a live booking', async () => {
      await given('tc-s1-105-setup');

      const res = await patch(MAIN_HALL, { capacity: 100 }).expect(200);

      expect(res.body.warnings).toHaveLength(1);
      expect(res.body.warnings[0].code).toBe('BOOKINGS_MAY_NEED_REVIEW');
      expect(res.body.warnings[0].affectedBookingIds).toEqual(['BKG-001']);
      expect(res.body.warnings[0].message).toMatch(/capacity reduced from 300 to 100/);
    });

    // TC-S1-105 · US-14 AC-3 · setup: base-users + base-venues + tc-s1-96-setup + tc-s1-105-setup · fails if the warning blocked the edit
    // Code: the warning is returned alongside the saved venue; updateDraft() never throws for it.
    it('applies the change anyway — a warning is not a rejection', async () => {
      await given('tc-s1-105-setup');

      await patch(MAIN_HALL, { capacity: 100 }).expect(200);

      const stored = await prisma.venue.findUniqueOrThrow({ where: { id: MAIN_HALL } });
      expect(stored.capacity).toBe(100);
    });

    // TC-S1-105 · US-14 AC-3 · setup: base-users + base-venues + tc-s1-96-setup + tc-s1-105-setup · fails if the Venue Staff member was not notified
    // Code: updateDraft() creates a VENUE_CHANGED_BOOKINGS_AFFECTED notification for the editor, shown in their inbox.
    it('records a durable notification for the staff member', async () => {
      await given('tc-s1-105-setup');

      await patch(MAIN_HALL, { capacity: 100 }).expect(200);

      const notes = await prisma.notification.findMany({ where: { recipientId: 'USR-010' } });
      expect(notes).toHaveLength(1);
      expect(notes[0].type).toBe(NotificationType.VENUE_CHANGED_BOOKINGS_AFFECTED);
    });

    // TC-S1-105 · US-14 AC-3 · setup: base-users + base-venues + tc-s1-96-setup + tc-s1-105-setup · fails if withdrawing a layout a booking may rely on gave no warning
    // Code: assessBookingImpact() lists withdrawn supportedLayouts among the reasons.
    it('warns when a layout is withdrawn', async () => {
      await given('tc-s1-105-setup');

      const res = await patch(MAIN_HALL, { supportedLayouts: ['THEATRE'] }).expect(200);

      expect(res.body.warnings[0].reasons.join(' ')).toMatch(/BANQUET/);
    });

    // TC-S1-105 · US-14 AC-3 · setup: base-users + base-venues + tc-s1-96-setup + tc-s1-105-setup · fails if an accessibility feature could be removed under a booking without a warning
    // Code: assessBookingImpact() lists removed accessibilityFeatures among the reasons.
    it('warns when an accessibility feature is removed', async () => {
      await given('tc-s1-105-setup');

      const res = await patch(MAIN_HALL, { accessibilityFeatures: ['STEP_FREE_ACCESS'] }).expect(200);

      expect(res.body.warnings[0].reasons.join(' ')).toMatch(/HEARING_LOOP/);
    });

    // TC-S1-105 · US-14 AC-3 · setup: base-users + base-venues + tc-s1-96-setup + tc-s1-105-setup · fails if an improvement (more capacity) raised a false alarm
    // Code: only a reduction counts.
    it('does not warn when capacity increases', async () => {
      await given('tc-s1-105-setup');

      const res = await patch(MAIN_HALL, { capacity: 900 }).expect(200);

      expect(res.body.warnings).toEqual([]);
    });

    // TC-S1-105 · US-14 AC-3 · setup: base-users + base-venues + tc-s1-96-setup · fails if a venue with no bookings raised a warning
    // Code: findLiveBookingsForVenue() returns nothing, so no warning.
    it('does not warn when the venue has no live bookings', async () => {
      const res = await patch(MAIN_HALL, { capacity: 10 }).expect(200);

      expect(res.body.warnings).toEqual([]);
    });

    // TC-S1-105 · US-14 AC-3 · setup: base-users + base-venues + tc-s1-96-setup + tc-s1-105-setup · fails if a booking that has already finished counted as active
    // Code: findLiveBookingsForVenue() requires end >= now (Seminar Room's BKG-002 ended in 2020).
    it('ignores a booking that has already finished', async () => {
      await given('tc-s1-105-setup');

      const res = await patch(SEMINAR_ROOM, { capacity: 10 }).expect(200);

      expect(res.body.warnings).toEqual([]);
    });

    // TC-S1-105 · US-14 AC-3 · setup: base-users + base-venues + tc-s1-96-setup + tc-s1-105-setup · fails if a rejected booking counted as active
    // Code: liveBookingsWhere() excludes REJECTED (Rooftop Terrace's BKG-003).
    it('ignores a rejected booking', async () => {
      await given('tc-s1-105-setup');

      const res = await patch(ROOFTOP, { capacity: 10 }).expect(200);

      expect(res.body.warnings).toEqual([]);
    });
  });

  describe('AC-4: a required field cannot be left blank', () => {
    // TC-S1-106 · US-14 AC-4 · setup: base-users + base-venues + tc-s1-96-setup · fails if clearing a required field on a published venue was saved
    // Code: updateDraft() runs assertPublishable() on the merged record when the venue is PUBLISHED (400, nothing written).
    it.each([
      ['name', { name: null }],
      ['location', { location: null }],
      ['capacity', { capacity: null }],
    ])('refuses to clear %s on a published venue', async (_label, body) => {
      const res = await patch(MAIN_HALL, body).expect(400);
      expect((res.body.message as string[]).join(' | ')).toMatch(/is required/);

      const stored = await prisma.venue.findUniqueOrThrow({ where: { id: MAIN_HALL } });
      expect(stored).toMatchObject({ name: 'Main Hall', location: 'Block A, Level 1', capacity: 300 });
    });

    // TC-S1-106 · US-14 AC-4 · setup: base-users + base-venues + tc-s1-96-setup · fails if spaces alone counted as filling a required field
    // Code: @Trim() turns "   " into null before the check.
    it('treats an empty string as blank', async () => {
      await patch(MAIN_HALL, { name: '   ' }).expect(400);
    });

    // TC-S1-106 · US-14 AC-4, US-13 AC-2 · setup: base-users + base-venues + tc-s1-96-setup · fails if a draft could not be left incomplete
    // Code: the completeness check runs only for PUBLISHED venues; VEN-001 is a draft.
    it('allows clearing on a draft, which may be incomplete', async () => {
      await patch(DRAFT, { name: null }).expect(200);

      const stored = await prisma.venue.findUniqueOrThrow({ where: { id: DRAFT } });
      expect(stored.name).toBeNull();
    });

    // TC-S1-106 · US-14 AC-4 · setup: base-users + base-venues + tc-s1-96-setup · fails if saving worked again only after a different change, not once the field is filled
    // Code: a non-blank value passes PublishableVenueDto.
    it('still allows replacing a required field with a real value', async () => {
      await patch(MAIN_HALL, { name: '' }).expect(400);

      const res = await patch(MAIN_HALL, { name: 'Renamed Hall' }).expect(200);
      expect(res.body.name).toBe('Renamed Hall');
    });
  });
});
