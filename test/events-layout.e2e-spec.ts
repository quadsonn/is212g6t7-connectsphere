import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/** US-06 e2e — one describe per acceptance criterion. */
describe('US-06 layout and accessibility preferences (e2e)', () => {
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
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
  });

  describe('AC-1: layout comes from a predefined list', () => {
    it.each(['THEATRE', 'CLASSROOM', 'BANQUET', 'BOARDROOM'])(
      'accepts %s',
      async (layout) => {
        const res = await http()
          .post('/events')
          .set('Authorization', as('organiser'))
          .send({ ...completeFields, preferredLayout: layout })
          .expect(201);

        expect(res.body.preferredLayout).toBe(layout);
      },
    );

    it('rejects a layout outside the list and names the valid options', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({ ...completeFields, preferredLayout: 'CABARET' })
        .expect(400);

      const messages = (res.body.message as string[]).join(' | ');
      expect(messages).toMatch(/preferredLayout must be one of/);
      expect(messages).toMatch(/THEATRE.*CLASSROOM.*BANQUET.*BOARDROOM/);
    });

    it('rejects a free-text layout, which belongs in layoutNotes', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({ ...completeFields, preferredLayout: 'theatre style-ish' })
        .expect(400);
    });
  });

  describe('AC-2: optional free-text notes alongside the selection', () => {
    it('stores notes with a selection', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          preferredLayout: 'THEATRE',
          layoutNotes: 'Raised platform at the front, centre aisle',
        })
        .expect(201);

      expect(res.body.preferredLayout).toBe('THEATRE');
      expect(res.body.layoutNotes).toMatch(/centre aisle/);
    });

    it('stores notes with no selection, for a layout not on the list', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({ ...completeFields, layoutNotes: 'Cabaret, eight to a table' })
        .expect(201);

      expect(res.body.preferredLayout).toBeNull();
      expect(res.body.layoutNotes).toMatch(/Cabaret/);
    });
  });

  describe('AC-3: accessibility requirements with optional notes', () => {
    it('records multiple requirements', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
        })
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual([
        'STEP_FREE_ACCESS',
        'HEARING_LOOP',
      ]);
    });

    it('records requirements with notes', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          accessibilityRequirements: ['ACCESSIBLE_RESTROOMS'],
          accessibilityNotes: 'Must be on the same floor as the venue',
        })
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual(['ACCESSIBLE_RESTROOMS']);
      expect(res.body.accessibilityNotes).toMatch(/same floor/);
    });

    it('accepts the newer features added to the list', async () => {
      const added = [
        'WHEELCHAIR_ACCESSIBLE_LIFT',
        'ACCESSIBLE_PARKING',
        'WHEELCHAIR_SEATING',
        'NURSING_ROOM',
      ];
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({ ...completeFields, accessibilityRequirements: added })
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual(added);
    });

    it('rejects an unrecognised requirement', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          accessibilityRequirements: ['STEP_FREE_ACCESS', 'TELEPORTER'],
        })
        .expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(
        /accessibilityRequirements must contain only/,
      );
    });

    it('rejects duplicates', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          accessibilityRequirements: ['HEARING_LOOP', 'HEARING_LOOP'],
        })
        .expect(400);
    });

    it('accepts notes with no structured requirement selected', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          accessibilityNotes: 'Quiet room required for sensory needs',
        })
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual([]);
      expect(res.body.accessibilityNotes).toMatch(/Quiet room/);
    });
  });

  describe('AC-4: values persist on draft and submitted, and survive reopening', () => {
    it('persists on a draft and is there when reopened', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({
          name: 'Work in progress',
          preferredLayout: 'BANQUET',
          layoutNotes: 'Round tables',
          accessibilityRequirements: ['STEP_FREE_ACCESS'],
          accessibilityNotes: 'Ramp to the stage',
        })
        .expect(201);

      const reopened = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(reopened.body).toMatchObject({
        status: EventStatus.DRAFT,
        preferredLayout: 'BANQUET',
        layoutNotes: 'Round tables',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        accessibilityNotes: 'Ramp to the stage',
      });
    });

    it('survives the draft being submitted', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          preferredLayout: 'CLASSROOM',
          accessibilityRequirements: ['HEARING_LOOP'],
          accessibilityNotes: 'Loop must reach the back row',
        })
        .expect(201);

      await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      const after = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(after.body).toMatchObject({
        status: EventStatus.SUBMITTED,
        preferredLayout: 'CLASSROOM',
        accessibilityRequirements: ['HEARING_LOOP'],
        accessibilityNotes: 'Loop must reach the back row',
      });
    });

    it('can be edited on a draft before submission', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ preferredLayout: 'THEATRE' })
        .expect(201);

      await http()
        .patch(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .send({
          preferredLayout: 'BOARDROOM',
          accessibilityRequirements: ['ACCESSIBLE_RESTROOMS'],
        })
        .expect(200);

      const after = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(after.body.preferredLayout).toBe('BOARDROOM');
      expect(after.body.accessibilityRequirements).toEqual(['ACCESSIBLE_RESTROOMS']);
    });
  });

  describe('AC-5: leaving them empty still saves', () => {
    it('submits a request with neither recorded', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      expect(res.body.preferredLayout).toBeNull();
      expect(res.body.layoutNotes).toBeNull();
      expect(res.body.accessibilityRequirements).toEqual([]);
      expect(res.body.accessibilityNotes).toBeNull();
      expect(res.body.status).toBe(EventStatus.SUBMITTED);
    });

    it('saves an empty draft with neither recorded', async () => {
      const res = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({})
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual([]);
    });

    it('submits a completed draft that omits them', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);
    });
  });

  describe('AC-6: a Coordinator reviewing the request sees both', () => {
    const submitWithPreferences = async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          preferredLayout: 'THEATRE',
          layoutNotes: 'Centre aisle required',
          accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
          accessibilityNotes: 'Ramp access to the stage',
        })
        .expect(201);
      // The Lead's assignment is a separate story; here the request is simply
      // already in this Coordinator's hands.
      await prisma.eventRequest.update({
        where: { id: res.body.id },
        data: { coordinatorId: ids.coordinator },
      });
      return res.body.id as string;
    };

    it('shows layout and accessibility in the review queue', async () => {
      await submitWithPreferences();

      const queue = await http()
        .get('/events')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(queue.body[0]).toMatchObject({
        preferredLayout: 'THEATRE',
        layoutNotes: 'Centre aisle required',
        accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
        accessibilityNotes: 'Ramp access to the stage',
      });
    });

    it('shows them when the Coordinator opens the request', async () => {
      const id = await submitWithPreferences();

      const opened = await http()
        .get(`/events/${id}`)
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(opened.body.preferredLayout).toBe('THEATRE');
      expect(opened.body.accessibilityRequirements).toEqual([
        'STEP_FREE_ACCESS',
        'HEARING_LOOP',
      ]);
    });

    it('still hides them from an Attendee — they are internal planning', async () => {
      await submitWithPreferences();

      const list = await http()
        .get('/events')
        .set('Authorization', as('attendee'))
        .expect(200);

      for (const event of list.body) {
        expect(event).not.toHaveProperty('preferredLayout');
        expect(event).not.toHaveProperty('layoutNotes');
        expect(event).not.toHaveProperty('accessibilityRequirements');
        expect(event).not.toHaveProperty('accessibilityNotes');
        // US-20 AC-3: internal planning too.
        expect(event).not.toHaveProperty('requiredFacilities');
      }
    });
  });
});
