import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccessibilityFeature,
  EventStatus,
  PrismaClient,
  Role,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-20 e2e — suitability flags for one venue against one of my events. */
describe('US-20 venue suitability flags (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedEvent = async (
    key: string,
    overrides: Partial<{
      coordinatorId: string | null;
      status: EventStatus;
      expectedAttendance: number;
      accessibilityRequirements: AccessibilityFeature[];
      preferredLayout: RoomLayout | null;
    }> = {},
  ) => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        status: EventStatus.APPROVED,
        name: key,
        purpose: 'Purpose',
        description: 'Description',
        category: 'Talk',
        proposedStart: new Date('2027-03-10T01:00:00Z'),
        proposedEnd: new Date('2027-03-10T09:00:00Z'),
        expectedAttendance: 80,
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
        preferredLayout: RoomLayout.THEATRE,
        ...overrides,
      },
    });
    ids[key] = event.id;
  };

  const suitability = (venueId: string, eventId: string, who = 'coordinator') =>
    http()
      .get(`/venues/${venueId}/suitability`)
      .query({ eventId })
      .set('Authorization', as(who));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.equipmentReservation.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('otherCoordinator', 'other@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);

    const venue = await prisma.venue.create({
      data: {
        name: 'Hall',
        location: 'Campus',
        capacity: 100,
        status: VenueStatus.PUBLISHED,
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
        supportedLayouts: [RoomLayout.THEATRE],
        managedById: ids.staff,
      },
    });
    ids.venue = venue.id;

    const draft = await prisma.venue.create({
      data: { name: 'Draft hall', status: VenueStatus.DRAFT, managedById: ids.staff },
    });
    ids.draftVenue = draft.id;
  });

  describe('AC-1/AC-2/AC-4: per-requirement flags and an overall indicator', () => {
    it('US-20: reports a suitable venue as positively SUITABLE, with each check shown', async () => {
      await seedEvent('fits');

      const res = await suitability(ids.venue, ids.fits).expect(200);

      expect(res.body).toMatchObject({
        overall: 'SUITABLE',
        overallSuitable: true,
        capacity: { status: 'MET', venueCapacity: 100, expectedAttendance: 80 },
        accessibility: {
          status: 'MET',
          items: [{ requirement: 'STEP_FREE_ACCESS', met: true }],
        },
        layout: { status: 'MET', requirement: 'THEATRE' },
      });
    });

    it('US-20: flags capacity and each missing accessibility requirement individually', async () => {
      await seedEvent('misfit', {
        expectedAttendance: 101,
        accessibilityRequirements: [
          AccessibilityFeature.STEP_FREE_ACCESS,
          AccessibilityFeature.HEARING_LOOP,
        ],
      });

      const res = await suitability(ids.venue, ids.misfit).expect(200);

      expect(res.body.overall).toBe('NOT_SUITABLE');
      expect(res.body.capacity.status).toBe('UNMET');
      expect(res.body.accessibility.items).toEqual([
        { requirement: 'STEP_FREE_ACCESS', met: true },
        { requirement: 'HEARING_LOOP', met: false },
      ]);
    });
  });

  describe('AC-3: facilities and equipment are reported as not checked, never faked', () => {
    it('US-20: returns null for both with the reason', async () => {
      await seedEvent('fits');

      const res = await suitability(ids.venue, ids.fits).expect(200);

      expect(res.body.facilities).toBeNull();
      expect(res.body.equipment).toBeNull();
      expect(res.body.notChecked.map((c: { check: string }) => c.check)).toEqual([
        'facilities',
        'equipment',
      ]);
    });
  });

  describe('AC-5: advisory only', () => {
    it('US-20: changes nothing — no booking, reservation, notification or event edit', async () => {
      await seedEvent('misfit', { expectedAttendance: 500 });
      const before = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.misfit } });

      await suitability(ids.venue, ids.misfit).expect(200);

      expect(await prisma.venueBooking.count()).toBe(0);
      expect(await prisma.equipmentReservation.count()).toBe(0);
      expect(await prisma.notification.count()).toBe(0);
      const after = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.misfit } });
      expect(after.updatedAt).toEqual(before.updatedAt);
      expect(after.status).toBe(before.status);
    });

    // US-21 (venue booking requests) is not on this branch or any pushed
    // branch yet. Complete this when it merges: run a suitability check that
    // reports NOT_SUITABLE, then submit the booking request and expect success.
    it.todo('US-20 AC-5: a booking request still submits after suitability reports flags (needs US-21)');
  });

  describe('AC-6: a single-venue check, fast', () => {
    it('US-20: answers within two seconds', async () => {
      await seedEvent('fits');

      const started = Date.now();
      await suitability(ids.venue, ids.fits).expect(200);

      expect(Date.now() - started).toBeLessThan(2000);
    });
  });

  describe('access: my assigned, active events only', () => {
    it("US-20: hides another Coordinator's event as not found", async () => {
      await seedEvent('theirs', { coordinatorId: ids.otherCoordinator });

      await suitability(ids.venue, ids.theirs).expect(404);
    });

    it('US-20: hides an unassigned event from the review pool', async () => {
      await seedEvent('pool', { coordinatorId: null, status: EventStatus.SUBMITTED });

      await suitability(ids.venue, ids.pool).expect(404);
    });

    it.each([EventStatus.REJECTED, EventStatus.CANCELLED, EventStatus.COMPLETED])(
      'US-20: hides a %s event as not found',
      async (status) => {
        await seedEvent('inactive', { status });

        await suitability(ids.venue, ids.inactive).expect(404);
      },
    );

    it('US-20: reports a draft venue as not found', async () => {
      await seedEvent('fits');

      await suitability(ids.draftVenue, ids.fits).expect(404);
    });

    it('US-20: requires an eventId', async () => {
      await http()
        .get(`/venues/${ids.venue}/suitability`)
        .set('Authorization', as('coordinator'))
        .expect(400);
    });

    it.each(['staff', 'organiser'])('US-20: refuses %s with 403', async (who) => {
      await seedEvent('fits');

      await suitability(ids.venue, ids.fits, who).expect(403);
    });
  });
});
