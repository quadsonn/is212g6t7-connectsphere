import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, EventStatus, PrismaClient, Role, VenueStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { NO_TECH_SUPPORT_AVAILABLE_MESSAGE } from '../src/events/technical-support.rules';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-61 e2e — the assigned Event Coordinator assigns an available Technical
 * Support member to an event requiring on-site support.
 */
describe('US-61 assign Technical Support Staff to an event (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);

  const seedUser = async (key: string, email: string, role: Role, name = key) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedEvent = (
    name: string,
    {
      start = at('10:00'),
      end = at('12:00'),
      status = EventStatus.PLANNING as EventStatus,
      technicalSupportNeeds = 'On-site AV technician for the keynote' as string | null,
      technicalSupportId = null as string | null,
      coordinatorId = ids.coordinator,
    } = {},
  ) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId,
        name,
        purpose: 'Share the roadmap',
        description: 'An all-hands',
        category: 'Corporate',
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: 80,
        equipmentNeeds: 'A projector and two microphones',
        technicalSupportNeeds,
        technicalSupportId,
        status,
      },
    });

  const getAssignment = (eventId: string, who = 'coordinator') =>
    http().get(`/events/${eventId}/technical-support`).set('Authorization', as(who));
  const assign = (eventId: string, staffId: string, who = 'coordinator') =>
    http()
      .put(`/events/${eventId}/technical-support`)
      .set('Authorization', as(who))
      .send({ staffId });
  const assigneeOf = async (eventId: string) =>
    (await prisma.eventRequest.findUniqueOrThrow({ where: { id: eventId } })).technicalSupportId;

  /** Everything these tests create, children first. */
  const clear = async () => {
    await prisma.notification.deleteMany();
    await prisma.eventChange.deleteMany();
    await prisma.equipmentRequirement.deleteMany();
    await prisma.equipmentReservation.updateMany({ data: { replacedById: null } });
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();
  };

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
    // Leave nothing behind for suites that delete users directly (status
    // changes and assignments reference users).
    await clear();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await clear();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR, 'Carla Coordinator');
    await seedUser('otherCoordinator', 'coordinator2@example.com', Role.EVENT_COORDINATOR);
    await seedUser('lead', 'lead@example.com', Role.EVENT_COORDINATOR_LEAD);
    await seedUser('wei', 'wei@example.com', Role.TECHNICAL_SUPPORT_STAFF, 'Wei Technical');
    await seedUser('nadia', 'nadia@example.com', Role.TECHNICAL_SUPPORT_STAFF, 'Nadia Technical');
  });

  describe('AC-1: an available member is recorded as assigned', () => {
    it('US-61 AC-1: assign succeeds and records the member against the event', async () => {
      const event = await seedEvent('Town Hall');

      const res = await assign(event.id, ids.wei).expect(200);

      expect(res.body.assignee).toMatchObject({ id: ids.wei, name: 'Wei Technical' });
      expect(await assigneeOf(event.id)).toBe(ids.wei);
    });

    it('US-61 AC-1: the assignment goes into the event history with who made it', async () => {
      const event = await seedEvent('Town Hall');

      await assign(event.id, ids.wei).expect(200);

      const history = await prisma.eventChange.findMany({ where: { eventId: event.id } });
      expect(history).toHaveLength(1);
      expect(history[0].changedById).toBe(ids.coordinator);
      expect(history[0].changes).toEqual([
        { field: 'technicalSupport', previous: null, next: 'Wei Technical' },
      ]);
    });

    it('US-61 AC-1: the screen lists every member as available when nobody is busy', async () => {
      const event = await seedEvent('Town Hall');

      const res = await getAssignment(event.id).expect(200);

      expect(res.body).toMatchObject({
        requiresTechnicalSupport: true,
        assignable: true,
        assignee: null,
        noneAvailable: false,
        message: null,
      });
      expect(res.body.staff.map((s: { id: string; available: boolean }) => [s.id, s.available])).toEqual([
        [ids.nadia, true],
        [ids.wei, true],
      ]);
    });

    it('US-61 AC-1: the Coordinator can change the assignment, and the change is recorded', async () => {
      const event = await seedEvent('Town Hall', { technicalSupportId: ids.wei });

      await assign(event.id, ids.nadia).expect(200);

      expect(await assigneeOf(event.id)).toBe(ids.nadia);
      const [entry] = await prisma.eventChange.findMany({ where: { eventId: event.id } });
      expect(entry.changes).toEqual([
        { field: 'technicalSupport', previous: 'Wei Technical', next: 'Nadia Technical' },
      ]);
    });

    it('US-61 AC-1: the Coordinator can remove the assignment', async () => {
      const event = await seedEvent('Town Hall', { technicalSupportId: ids.wei });

      const res = await http()
        .delete(`/events/${event.id}/technical-support`)
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body.assignee).toBeNull();
      expect(await assigneeOf(event.id)).toBeNull();
    });

    it('US-61 AC-1: an event not marked as requiring technical support cannot be assigned', async () => {
      const event = await seedEvent('Quiet Meeting', { technicalSupportNeeds: null });

      const res = await assign(event.id, ids.wei).expect(409);

      expect(res.body.message).toMatch(/does not require technical support/);
      expect(await assigneeOf(event.id)).toBeNull();
    });

    it('US-61 AC-1: a user without the Technical Support role cannot be assigned', async () => {
      const event = await seedEvent('Town Hall');

      await assign(event.id, ids.otherCoordinator).expect(400);
      expect(await assigneeOf(event.id)).toBeNull();
    });
  });

  describe('AC-2: an overlapping assignment is blocked and the conflict shown', () => {
    it('US-61 AC-2: overlapping assignment blocked, naming the conflicting event and time', async () => {
      const busy = await seedEvent('Product Launch', {
        start: at('11:00'),
        end: at('13:00'),
        technicalSupportId: ids.wei,
      });
      const event = await seedEvent('Town Hall');

      const res = await assign(event.id, ids.wei).expect(409);

      expect(res.body.message).toMatch(/Wei Technical is already assigned to "Product Launch"/);
      expect(res.body.noneAvailable).toBe(false);
      expect(res.body.conflicts).toEqual([
        {
          eventId: busy.id,
          name: 'Product Launch',
          start: at('11:00').toISOString(),
          end: at('13:00').toISOString(),
        },
      ]);
      expect(await assigneeOf(event.id)).toBeNull();
    });

    it('US-61 AC-2: the assignment screen shows the conflict before anything is attempted', async () => {
      const busy = await seedEvent('Product Launch', {
        start: at('11:00'),
        end: at('13:00'),
        technicalSupportId: ids.wei,
      });
      const event = await seedEvent('Town Hall');

      const res = await getAssignment(event.id).expect(200);
      const wei = res.body.staff.find((s: { id: string }) => s.id === ids.wei);

      expect(wei.available).toBe(false);
      expect(wei.conflicts.map((c: { eventId: string }) => c.eventId)).toEqual([busy.id]);
    });

    it('US-61 AC-2: a back-to-back event is not a conflict', async () => {
      await seedEvent('Morning Session', {
        start: at('08:00'),
        end: at('10:00'),
        technicalSupportId: ids.wei,
      });
      const event = await seedEvent('Town Hall');

      await assign(event.id, ids.wei).expect(200);
    });

    it('US-61 AC-2: a cancelled event no longer holds its assignee', async () => {
      await seedEvent('Cancelled Launch', {
        start: at('11:00'),
        end: at('13:00'),
        technicalSupportId: ids.wei,
        status: EventStatus.CANCELLED,
      });
      const event = await seedEvent('Town Hall');

      await assign(event.id, ids.wei).expect(200);
    });
  });

  describe('AC-3: the assigned member sees the event in their own list', () => {
    it('US-61 AC-3: assigned staff sees date, time, venue and technical requirements', async () => {
      const venue = await prisma.venue.create({
        data: { name: 'Harbour Hall', location: 'Level 2', capacity: 200, status: VenueStatus.PUBLISHED },
      });
      const event = await seedEvent('Town Hall');
      await prisma.venueBooking.create({
        data: {
          eventId: event.id,
          venueId: venue.id,
          start: at('09:30'),
          end: at('12:30'),
          status: BookingStatus.APPROVED,
        },
      });
      await prisma.equipmentRequirement.create({
        data: { eventId: event.id, equipmentType: 'Wireless microphone', quantity: 2, notes: 'Lapel' },
      });
      await assign(event.id, ids.wei).expect(200);

      const res = await http()
        .get('/technical-support/assignments')
        .set('Authorization', as('wei'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        eventId: event.id,
        name: 'Town Hall',
        proposedStart: at('10:00').toISOString(),
        proposedEnd: at('12:00').toISOString(),
        organiserEquipmentNeeds: 'A projector and two microphones',
        technicalSupportNeeds: 'On-site AV technician for the keynote',
        coordinatorRequirements: [
          expect.objectContaining({ equipmentType: 'Wireless microphone', quantity: 2, notes: 'Lapel' }),
        ],
        venues: [expect.objectContaining({ venueName: 'Harbour Hall', status: BookingStatus.APPROVED })],
      });
    });

    it('US-61 AC-3: another member does not see someone else’s assignment', async () => {
      const event = await seedEvent('Town Hall');
      await assign(event.id, ids.wei).expect(200);

      const res = await http()
        .get('/technical-support/assignments')
        .set('Authorization', as('nadia'))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('US-61 AC-3: an event that has ended drops out of the list', async () => {
      await seedEvent('Old Launch', { status: EventStatus.CANCELLED, technicalSupportId: ids.wei });

      const res = await http()
        .get('/technical-support/assignments')
        .set('Authorization', as('wei'))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('US-61 AC-3: only Technical Support can read an assignment list', async () => {
      await http()
        .get('/technical-support/assignments')
        .set('Authorization', as('coordinator'))
        .expect(403);
    });
  });

  describe('AC-4: nobody available', () => {
    const fillEveryone = async () => {
      await seedEvent('Product Launch', { start: at('09:00'), end: at('11:00'), technicalSupportId: ids.wei });
      await seedEvent('Board Meeting', { start: at('11:30'), end: at('12:30'), technicalSupportId: ids.nadia });
    };

    it('US-61 AC-4: no-one available shows the message on the assignment screen', async () => {
      await fillEveryone();
      const event = await seedEvent('Town Hall');

      const res = await getAssignment(event.id).expect(200);

      expect(res.body.noneAvailable).toBe(true);
      expect(res.body.message).toBe(NO_TECH_SUPPORT_AVAILABLE_MESSAGE);
      expect(res.body.staff.every((s: { available: boolean }) => !s.available)).toBe(true);
    });

    it('US-61 AC-4: attempting to assign anyway makes no assignment and returns the message', async () => {
      await fillEveryone();
      const event = await seedEvent('Town Hall');

      const res = await assign(event.id, ids.wei).expect(409);

      expect(res.body.message).toBe(NO_TECH_SUPPORT_AVAILABLE_MESSAGE);
      expect(res.body.noneAvailable).toBe(true);
      expect(await assigneeOf(event.id)).toBeNull();
      expect(await prisma.eventChange.count({ where: { eventId: event.id } })).toBe(0);
    });

    it('US-61 AC-4: with no Technical Support accounts at all, the message is shown', async () => {
      await prisma.revokedToken.deleteMany();
      await prisma.user.deleteMany({ where: { role: Role.TECHNICAL_SUPPORT_STAFF } });
      const event = await seedEvent('Town Hall');

      const res = await getAssignment(event.id).expect(200);

      expect(res.body.staff).toEqual([]);
      expect(res.body.message).toBe(NO_TECH_SUPPORT_AVAILABLE_MESSAGE);
    });
  });

  describe('only the assigned Coordinator may assign', () => {
    it.each(['organiser', 'wei', 'lead'])('US-61: non-Coordinators can’t assign (%s → 403)', async (who) => {
      const event = await seedEvent('Town Hall');

      await assign(event.id, ids.nadia, who).expect(403);
      await getAssignment(event.id, who).expect(403);
      expect(await assigneeOf(event.id)).toBeNull();
    });

    it('US-61: a Coordinator not assigned to the event cannot assign', async () => {
      const event = await seedEvent('Town Hall');

      const res = await assign(event.id, ids.nadia, 'otherCoordinator');

      expect([403, 404]).toContain(res.status);
      expect(await assigneeOf(event.id)).toBeNull();
    });

    it('US-61: an unauthenticated request is refused', async () => {
      const event = await seedEvent('Town Hall');

      await http().put(`/events/${event.id}/technical-support`).send({ staffId: ids.wei }).expect(401);
    });
  });
});
