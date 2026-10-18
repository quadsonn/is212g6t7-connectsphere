import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessibilityFeature, EventStatus, PrismaClient, Role, RoomLayout } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/**
 * US-30 e2e — view equipment and technical requirements described for an
 * event. One describe per acceptance criterion, tagged "US-30 AC-n".
 *
 * The three requirement sources: the Organiser's free-text equipment needs,
 * and the Coordinator's requirement rows and technical support notes (US-27).
 */
describe('US-30 view equipment and technical requirements for an event (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';
  const NONE = 'No equipment or technical requirements have been recorded for this event.';
  const OTHER_ROLES = ['coordinator', 'organiser', 'attendee', 'venueStaff'];

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const get = (path: string, who = 'tech') => http().get(path).set('Authorization', as(who));

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
    ids[key] = user.id;
  };

  /** An event with no requirement source unless the overrides add one. */
  const seedEvent = async (
    name: string,
    overrides: {
      status?: EventStatus;
      equipmentNeeds?: string | null;
      technicalSupportNeeds?: string | null;
      rows?: { equipmentType: string; quantity: number; notes?: string | null }[];
    } = {},
  ) => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name,
        purpose: 'Purpose',
        description: `${name} — description`,
        category: 'Conference',
        proposedStart: new Date(START),
        proposedEnd: new Date(END),
        expectedAttendance: 120,
        preferredLayout: RoomLayout.THEATRE,
        layoutNotes: 'Stage at the front',
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
        accessibilityNotes: 'Ramp at the side entrance',
        programme: '09:00 Welcome\n10:00 Talks',
        status: overrides.status ?? EventStatus.PLANNING,
        equipmentNeeds: overrides.equipmentNeeds ?? null,
        technicalSupportNeeds: overrides.technicalSupportNeeds ?? null,
      },
    });
    for (const row of overrides.rows ?? []) {
      await prisma.equipmentRequirement.create({ data: { eventId: event.id, ...row } });
    }
    return event;
  };

  const listedIds = async () =>
    (await get('/equipment/requirements').expect(200)).body.map((e: { eventId: string }) => e.eventId);

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
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany(); // cascades to EquipmentRequirement
    await prisma.user.deleteMany();

    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
    await seedUser('venueStaff', 'venue@example.com', Role.VENUE_STAFF);

    ids.organiserOnly = (await seedEvent('Organiser Only', { equipmentNeeds: 'Six wireless mics.' })).id;
    ids.rowsOnly = (
      await seedEvent('Rows Only', {
        rows: [
          { equipmentType: 'Laser projector', quantity: 2 },
          { equipmentType: 'Wireless microphone', quantity: 6, notes: 'Lapel' },
        ],
      })
    ).id;
    ids.notesOnly = (
      await seedEvent('Notes Only', { technicalSupportNeeds: 'On-site AV technician all day.' })
    ).id;
    ids.allThree = (
      await seedEvent('All Three', {
        equipmentNeeds: 'Mics and a projector.',
        technicalSupportNeeds: 'Technician on call.',
        rows: [{ equipmentType: 'PA system', quantity: 1 }],
      })
    ).id;
    ids.none = (await seedEvent('None Recorded')).id;
    ids.draft = (
      await seedEvent('Draft With Everything', {
        status: EventStatus.DRAFT,
        equipmentNeeds: 'Six mics.',
        technicalSupportNeeds: 'Technician.',
        rows: [{ equipmentType: 'PA system', quantity: 1 }],
      })
    ).id;
  });

  describe('US-30 AC-1: requirements from the Organiser and the Coordinator are visible', () => {
    it('Organiser text only', async () => {
      const res = await get(`/equipment/requirements/${ids.organiserOnly}`).expect(200);

      expect(res.body).toEqual({
        eventId: ids.organiserOnly,
        name: 'Organiser Only',
        description: 'Organiser Only — description',
        status: 'PLANNING',
        proposedStart: START,
        proposedEnd: END,
        organiserEquipmentNeeds: 'Six wireless mics.',
        coordinatorRequirements: [],
        technicalSupportNeeds: null,
        hasRequirements: true,
        message: null,
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('Coordinator requirement rows only', async () => {
      const res = await get(`/equipment/requirements/${ids.rowsOnly}`).expect(200);

      expect(res.body).toMatchObject({
        organiserEquipmentNeeds: null,
        technicalSupportNeeds: null,
        hasRequirements: true,
      });
      expect(res.body.coordinatorRequirements).toEqual([
        { id: expect.any(String), equipmentType: 'Laser projector', quantity: 2, notes: null },
        { id: expect.any(String), equipmentType: 'Wireless microphone', quantity: 6, notes: 'Lapel' },
      ]);
    });

    it('technical support notes only', async () => {
      const res = await get(`/equipment/requirements/${ids.notesOnly}`).expect(200);

      expect(res.body).toMatchObject({
        organiserEquipmentNeeds: null,
        coordinatorRequirements: [],
        technicalSupportNeeds: 'On-site AV technician all day.',
        hasRequirements: true,
      });
    });

    it('all three together', async () => {
      const res = await get(`/equipment/requirements/${ids.allThree}`).expect(200);

      expect(res.body).toMatchObject({
        organiserEquipmentNeeds: 'Mics and a projector.',
        technicalSupportNeeds: 'Technician on call.',
        coordinatorRequirements: [{ equipmentType: 'PA system', quantity: 1, notes: null }],
        hasRequirements: true,
      });
    });

    it('the list includes an event with any one of the three sources', async () => {
      const listed = await listedIds();

      expect(listed).toEqual(
        expect.arrayContaining([ids.organiserOnly, ids.rowsOnly, ids.notesOnly, ids.allThree]),
      );
    });
  });

  describe('US-30 AC-2: what was requested is shown, not just that a request exists', () => {
    it('the list carries the requirement content itself', async () => {
      const res = await get('/equipment/requirements').expect(200);
      const rows = res.body.find((e: { eventId: string }) => e.eventId === ids.rowsOnly);

      expect(rows.coordinatorRequirements).toHaveLength(2);
      expect(rows.coordinatorRequirements[1]).toMatchObject({
        equipmentType: 'Wireless microphone',
        quantity: 6,
        notes: 'Lapel',
      });
    });

    it('requirements responses never include other planning fields', async () => {
      const res = await get(`/equipment/requirements/${ids.allThree}`).expect(200);

      for (const field of ['expectedAttendance', 'preferredLayout', 'accessibilityRequirements', 'programme']) {
        expect(res.body).not.toHaveProperty(field);
      }
    });
  });

  describe('US-30 AC-3: none of the three recorded is clearly indicated', () => {
    it('reports none recorded, with a message, for a submitted event with nothing', async () => {
      const res = await get(`/equipment/requirements/${ids.none}`).expect(200);

      expect(res.body).toMatchObject({
        organiserEquipmentNeeds: null,
        coordinatorRequirements: [],
        technicalSupportNeeds: null,
        hasRequirements: false,
        message: NONE,
      });
    });

    it('treats whitespace-only text as nothing recorded', async () => {
      const blank = await seedEvent('Blank Text', { equipmentNeeds: '   ', technicalSupportNeeds: ' ' });

      const res = await get(`/equipment/requirements/${blank.id}`).expect(200);

      expect(res.body).toMatchObject({ hasRequirements: false, message: NONE });
      expect(await listedIds()).not.toContain(blank.id);
    });

    it('leaves an event with nothing recorded out of the list', async () => {
      expect(await listedIds()).not.toContain(ids.none);
    });
  });

  describe('US-30 AC-4: only submitted events with requirements; drafts are not visible', () => {
    it('a draft with all three sources is not in the list', async () => {
      expect(await listedIds()).not.toContain(ids.draft);
    });

    it('a draft returns 404 on the requirements route', async () => {
      await get(`/equipment/requirements/${ids.draft}`).expect(404);
    });

    it('a draft returns 404 on the details route', async () => {
      await get(`/equipment/requirements/${ids.draft}/details`).expect(404);
    });

    it.each(OTHER_ROLES)('%s gets 403 on the list, requirements and details routes', async (who) => {
      await get('/equipment/requirements', who).expect(403);
      await get(`/equipment/requirements/${ids.allThree}`, who).expect(403);
      await get(`/equipment/requirements/${ids.allThree}/details`, who).expect(403);
    });

    it('is refused without a token', async () => {
      await http().get('/equipment/requirements').expect(401);
      await http().get(`/equipment/requirements/${ids.allThree}/details`).expect(401);
    });
  });

  describe('US-30 AC-4: "View more details" opens any submitted event; drafts hidden', () => {
    it('returns the full event details', async () => {
      const res = await get(`/equipment/requirements/${ids.organiserOnly}/details`).expect(200);

      expect(res.body).toEqual({
        eventId: ids.organiserOnly,
        name: 'Organiser Only',
        description: 'Organiser Only — description',
        status: 'PLANNING',
        proposedStart: START,
        proposedEnd: END,
        expectedAttendance: 120,
        preferredLayout: 'THEATRE',
        layoutNotes: 'Stage at the front',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        accessibilityNotes: 'Ramp at the side entrance',
        programme: '09:00 Welcome\n10:00 Talks',
        coordinator: { name: 'coordinator', email: 'coordinator@example.com' },
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it.each(['rowsOnly', 'notesOnly', 'allThree'])(
      'opens for an event whose source is %s',
      async (key) => {
        await get(`/equipment/requirements/${ids[key]}/details`).expect(200);
      },
    );

    it('opens for a submitted event with none of the three sources', async () => {
      const res = await get(`/equipment/requirements/${ids.none}/details`).expect(200);

      expect(res.body).toMatchObject({ eventId: ids.none, name: 'None Recorded' });
    });

    it('404s for an unknown event', async () => {
      await get('/equipment/requirements/does-not-exist/details').expect(404);
    });

    it('does not expose the requirement text or other internal fields', async () => {
      const res = await get(`/equipment/requirements/${ids.allThree}/details`).expect(200);

      for (const field of ['equipmentNeeds', 'technicalSupportNeeds', '_count', 'organiserId']) {
        expect(res.body).not.toHaveProperty(field);
      }
    });
  });
});
