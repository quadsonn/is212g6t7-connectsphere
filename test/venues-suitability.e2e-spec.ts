import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccessibilityFeature,
  EquipmentStatus,
  EventStatus,
  Facility,
  PrismaClient,
  ReservationStatus,
  Role,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

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
      requiredFacilities: Facility[];
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
    await listenOnLoopback(app);

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
    await prisma.equipment.deleteMany();
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
        facilities: [Facility.PROJECTOR, Facility.MICROPHONE],
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

  describe('AC-3: facilities cover the technical requirements', () => {
    it('Given the venue has every required facility, Then facilities are met', async () => {
      await seedEvent('fits', { requiredFacilities: [Facility.PROJECTOR, Facility.MICROPHONE] });

      const res = await suitability(ids.venue, ids.fits).expect(200);

      expect(res.body.overall).toBe('SUITABLE');
      expect(res.body.facilities).toEqual({
        status: 'MET',
        items: [
          { requirement: 'PROJECTOR', met: true },
          { requirement: 'MICROPHONE', met: true },
        ],
      });
    });

    it('Given a required facility the venue lacks, Then it is flagged and the venue may not be suitable', async () => {
      await seedEvent('stage', { requiredFacilities: [Facility.PROJECTOR, Facility.STAGE] });

      const res = await suitability(ids.venue, ids.stage).expect(200);

      expect(res.body.overall).toBe('NOT_SUITABLE');
      expect(res.body.facilities.status).toBe('UNMET');
      expect(res.body.facilities.items).toContainEqual({ requirement: 'STAGE', met: false });
    });

    it('Given no required facilities, Then nothing is required and nothing is reported unchecked', async () => {
      await seedEvent('fits');

      const res = await suitability(ids.venue, ids.fits).expect(200);

      expect(res.body.facilities).toEqual({ status: 'NOT_REQUIRED', items: [] });
      expect(res.body.equipment).toEqual({ status: 'NOT_REQUIRED', items: [] });
      expect(res.body.notChecked).toEqual([]);
    });
  });

  describe('AC-3: the equipment asked for is available over the event dates', () => {
    const seedEquipment = async (
      key: string,
      totalQuantity: number,
      operationalStatus: EquipmentStatus = EquipmentStatus.OPERATIONAL,
    ) => {
      const item = await prisma.equipment.create({
        data: { type: `${key} type`, totalQuantity, operationalStatus },
      });
      ids[key] = item.id;
    };

    const requires = (eventKey: string, equipmentType: string, quantity: number, equipmentKey?: string) =>
      prisma.equipmentRequirement.create({
        data: {
          eventId: ids[eventKey],
          equipmentType,
          quantity,
          equipmentId: equipmentKey ? ids[equipmentKey] : null,
        },
      });

    const reserve = (
      eventKey: string,
      equipmentKey: string,
      quantity: number,
      status: ReservationStatus = ReservationStatus.APPROVED,
    ) =>
      prisma.equipmentReservation.create({
        data: {
          eventId: ids[eventKey],
          equipmentId: ids[equipmentKey],
          quantity,
          // Overlaps the seeded event's 01:00–09:00 UTC.
          start: new Date('2027-03-10T05:00:00Z'),
          end: new Date('2027-03-10T12:00:00Z'),
          status,
        },
      });

    it('Given enough free units, Then equipment is met, with the free count', async () => {
      await seedEvent('fits');
      await seedEquipment('mic', 6);
      await requires('fits', 'Wireless mic', 4, 'mic');

      const res = await suitability(ids.venue, ids.fits).expect(200);

      expect(res.body.equipment).toEqual({
        status: 'MET',
        items: [{ item: 'Wireless mic', requestedQuantity: 4, availableQuantity: 6, available: true }],
      });
    });

    it("Given another event's approved reservation leaves too few units, Then equipment is unmet", async () => {
      await seedEvent('fits');
      await seedEvent('other');
      await seedEquipment('mic', 6);
      await requires('fits', 'Wireless mic', 4, 'mic');
      await reserve('other', 'mic', 3);

      const res = await suitability(ids.venue, ids.fits).expect(200);

      expect(res.body.equipment.status).toBe('UNMET');
      expect(res.body.equipment.items[0]).toMatchObject({ availableQuantity: 3, available: false });
      // Equipment is the same at every venue, so the venue verdict stands.
      expect(res.body.overall).toBe('SUITABLE');
    });

    it("Given the event's own approved reservation, Then its units are not counted against it", async () => {
      await seedEvent('fits');
      await seedEquipment('mic', 6);
      await requires('fits', 'Wireless mic', 4, 'mic');
      await reserve('fits', 'mic', 4);

      const res = await suitability(ids.venue, ids.fits).expect(200);

      expect(res.body.equipment.items[0]).toMatchObject({ availableQuantity: 6, available: true });
    });

    it('Given a pending reservation elsewhere, Then it holds no units', async () => {
      await seedEvent('fits');
      await seedEvent('other');
      await seedEquipment('mic', 6);
      await requires('fits', 'Wireless mic', 4, 'mic');
      await reserve('other', 'mic', 6, ReservationStatus.REQUESTED);

      const res = await suitability(ids.venue, ids.fits).expect(200);

      expect(res.body.equipment.items[0].available).toBe(true);
    });

    it('Given an item under maintenance, Then none of its units are available', async () => {
      await seedEvent('fits');
      await seedEquipment('mic', 6, EquipmentStatus.UNDER_MAINTENANCE);
      await requires('fits', 'Wireless mic', 1, 'mic');

      const res = await suitability(ids.venue, ids.fits).expect(200);

      expect(res.body.equipment.items[0]).toMatchObject({ availableQuantity: 0, available: false });
    });

    it('Given a free-text line, Then it is listed as not checked, never as a pass', async () => {
      await seedEvent('fits');
      await requires('fits', 'Fog machine', 1);

      const res = await suitability(ids.venue, ids.fits).expect(200);

      expect(res.body.equipment).toEqual({
        status: 'NOT_RECORDED',
        items: [{ item: 'Fog machine', requestedQuantity: 1, availableQuantity: null, available: null }],
      });
      expect(res.body.notChecked).toEqual([
        { check: 'equipment', reason: expect.stringMatching(/not linked to the catalogue/) },
      ]);
    });

    it('reserves nothing while checking', async () => {
      await seedEvent('fits');
      await seedEquipment('mic', 6);
      await requires('fits', 'Wireless mic', 4, 'mic');

      await suitability(ids.venue, ids.fits).expect(200);

      expect(await prisma.equipmentReservation.count()).toBe(0);
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
