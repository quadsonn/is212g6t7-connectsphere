import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EquipmentStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-29 e2e — one describe per acceptance criterion, tagged "US-29 AC-n". */
describe('US-29 view the equipment catalogue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
    return user;
  };

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
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);

    await prisma.equipment.createMany({
      data: [
        {
          type: 'Wireless microphone',
          description: 'Handheld UHF mic.',
          location: 'AV Store, Level 1',
          totalQuantity: 24,
          operationalStatus: EquipmentStatus.OPERATIONAL,
        },
        {
          type: 'Projector (4K)',
          description: 'Ceiling-mountable.',
          location: 'AV Store, Level 2',
          totalQuantity: 8,
          operationalStatus: EquipmentStatus.UNDER_MAINTENANCE,
        },
        {
          type: 'Folding table',
          description: null,
          location: null,
          totalQuantity: 40,
          operationalStatus: EquipmentStatus.OPERATIONAL,
        },
      ],
    });
  });

  describe('US-29 AC-1: the list shows key details at a glance', () => {
    it('returns type, description, quantity and location for every item', async () => {
      const res = await http().get('/equipment').set('Authorization', as('tech')).expect(200);

      expect(res.body).toHaveLength(3);
      const mic = res.body.find((item: { type: string }) => item.type === 'Wireless microphone');
      expect(mic).toEqual({
        id: expect.any(String),
        type: 'Wireless microphone',
        description: 'Handheld UHF mic.',
        location: 'AV Store, Level 1',
        totalQuantity: 24,
      });
    });

    it.each(['coordinator', 'organiser', 'attendee'])(
      'is refused to %s — Technical Support only',
      async (who) => {
        await http().get('/equipment').set('Authorization', as(who)).expect(403);
      },
    );

    it('is refused without a token', async () => {
      await http().get('/equipment').expect(401);
    });
  });

  describe('US-29 AC-2: selecting an item shows its full details', () => {
    it('includes operational status, not present in the list response alone', async () => {
      const list = await http().get('/equipment').set('Authorization', as('tech')).expect(200);
      const projector = list.body.find((item: { type: string }) => item.type === 'Projector (4K)');

      const res = await http()
        .get(`/equipment/${projector.id}`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body).toEqual({
        id: projector.id,
        type: 'Projector (4K)',
        description: 'Ceiling-mountable.',
        location: 'AV Store, Level 2',
        totalQuantity: 8,
        operationalStatus: 'UNDER_MAINTENANCE',
      });
      expect(projector).not.toHaveProperty('operationalStatus');
    });

    it('is refused to a Coordinator — Technical Support only', async () => {
      const list = await http().get('/equipment').set('Authorization', as('tech')).expect(200);

      await http()
        .get(`/equipment/${list.body[0].id}`)
        .set('Authorization', as('coordinator'))
        .expect(403);
    });

    it('404s for an id that does not exist', async () => {
      await http()
        .get('/equipment/does-not-exist')
        .set('Authorization', as('tech'))
        .expect(404);
    });
  });

  describe('US-29 AC-3: an item can be located without scrolling the whole list', () => {
    it('looks up by a case-insensitive type substring', async () => {
      const res = await http()
        .get('/equipment')
        .query({ search: 'projector' })
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].type).toBe('Projector (4K)');
    });

    it('sorts by total quantity', async () => {
      const res = await http()
        .get('/equipment')
        .query({ sortBy: 'totalQuantity', sortOrder: 'desc' })
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body.map((item: { type: string }) => item.type)).toEqual([
        'Folding table',
        'Wireless microphone',
        'Projector (4K)',
      ]);
    });

    it('rejects a sortBy field outside the fixed vocabulary', async () => {
      const res = await http()
        .get('/equipment')
        .query({ sortBy: 'notAField' })
        .set('Authorization', as('tech'))
        .expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(/sortBy must be one of/);
    });
  });

  describe('US-29 AC-4: the catalogue reflects the latest saved data', () => {
    it('is not cached — a newly added item appears immediately', async () => {
      const before = await http().get('/equipment').set('Authorization', as('tech')).expect(200);
      expect(before.body).toHaveLength(3);

      await prisma.equipment.create({
        data: { type: 'Extension reel', totalQuantity: 10 },
      });

      const after = await http().get('/equipment').set('Authorization', as('tech')).expect(200);
      expect(after.body).toHaveLength(4);
      expect(after.headers['cache-control']).toBe('no-store');
    });
  });
});
