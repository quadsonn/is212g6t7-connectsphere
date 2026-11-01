import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { resetDb } from './helpers/reset-db';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-19 AC-3 e2e — the facilities an event needs, recorded by the Organiser
 * from the same list venues describe themselves with, so suitability can
 * compare the two.
 */
describe('US-19 AC-3 required facilities on an event request (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const completeFields = {
    name: 'Freshman Orientation 2030',
    purpose: 'Welcome new students',
    description: 'Full-day programme',
    category: 'Student engagement',
    proposedStart: '2030-10-01T09:00:00.000Z',
    proposedEnd: '2030-10-01T17:00:00.000Z',
    expectedAttendance: 300,
  };

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const submit = (fields: Record<string, unknown>) =>
    http().post('/events').set('Authorization', as('organiser')).send({ ...completeFields, ...fields });

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
    // Every table, whatever earlier test files left behind (localhost and a
    // _test database only — resetDb checks before it deletes anything).
    await resetDb(prisma);

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
  });

  describe('recording them', () => {
    it('Given facilities from the list, When submitted, Then they are stored', async () => {
      const res = await submit({ requiredFacilities: ['PROJECTOR', 'MICROPHONE'] }).expect(201);

      expect(res.body.requiredFacilities).toEqual(['PROJECTOR', 'MICROPHONE']);
    });

    it('Given none, When submitted, Then the request saves with an empty list', async () => {
      const res = await submit({}).expect(201);

      expect(res.body.requiredFacilities).toEqual([]);
    });

    it('rejects a facility outside the list and names the valid ones', async () => {
      const res = await submit({ requiredFacilities: ['JACUZZI'] }).expect(400);

      expect(JSON.stringify(res.body.message)).toMatch(/requiredFacilities must contain only: .*PROJECTOR/);
    });

    it('rejects duplicates', async () => {
      await submit({ requiredFacilities: ['PROJECTOR', 'PROJECTOR'] }).expect(400);
    });

    it('can be saved on a draft and edited before submission', async () => {
      const draft = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ requiredFacilities: ['STAGE'] })
        .expect(201);
      expect(draft.body.requiredFacilities).toEqual(['STAGE']);

      await http()
        .patch(`/events/${draft.body.id}`)
        .set('Authorization', as('organiser'))
        .send({ requiredFacilities: ['STAGE', 'SOUND_SYSTEM'] })
        .expect(200);

      const after = await http()
        .get(`/events/${draft.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);
      expect(after.body.requiredFacilities).toEqual(['STAGE', 'SOUND_SYSTEM']);
    });
  });

  describe('changing them later', () => {
    it('Given a clarification response that changes them, Then the change is recorded in the history', async () => {
      const created = await submit({ requiredFacilities: ['PROJECTOR'] }).expect(201);
      await prisma.eventRequest.update({
        where: { id: created.body.id },
        data: {
          coordinatorId: ids.coordinator,
          status: EventStatus.AWAITING_CLARIFICATION,
          clarificationRequest: 'Do you need sound?',
        },
      });

      await http()
        .post(`/events/${created.body.id}/clarifications/responses`)
        .set('Authorization', as('organiser'))
        .send({ response: 'Yes, and microphones.', changes: { requiredFacilities: ['PROJECTOR', 'MICROPHONE'] } })
        .expect(201);

      const change = await prisma.eventChange.findFirstOrThrow({ where: { eventId: created.body.id } });
      expect(change.changes).toEqual([
        { field: 'requiredFacilities', previous: ['PROJECTOR'], next: ['PROJECTOR', 'MICROPHONE'] },
      ]);
    });
  });

  describe('the Coordinator sees them', () => {
    it('shows them when the assigned Coordinator opens the request', async () => {
      const created = await submit({ requiredFacilities: ['VIDEO_CONFERENCING'] }).expect(201);
      await prisma.eventRequest.update({
        where: { id: created.body.id },
        data: { coordinatorId: ids.coordinator },
      });

      const opened = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(opened.body.requiredFacilities).toEqual(['VIDEO_CONFERENCING']);
    });
  });
});
