import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { UnauthorizedFilter } from '../src/common/filters/unauthorized.filter';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-02 e2e — one describe per acceptance criterion. Every check goes through
 * HTTP, which is the point of AC-3: the server enforces, not the UI.
 */
describe('US-02 role-based and ownership access control (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        name: key,
        role,
      },
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
    app.useGlobalFilters(new UnauthorizedFilter());
    await listenOnLoopback(app);

    prisma = new PrismaClient();

    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiserA', 'organiser.a@example.com', Role.EVENT_ORGANISER);
    await seedUser('organiserB', 'organiser.b@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinatorA', 'coordinator.a@example.com', Role.EVENT_COORDINATOR);
    await seedUser('coordinatorB', 'coordinator.b@example.com', Role.EVENT_COORDINATOR);
    await seedUser('venueStaff', 'venue@example.com', Role.VENUE_STAFF);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);

    const baseEvent = {
      purpose: 'Purpose',
      category: 'Conference',
      description: 'Description',
      // 30 days out: inside the default registration window, so the CONFIRMED
      // fixtures stay visible to the Attendee list whenever the suite runs.
      proposedStart: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      proposedEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
      expectedAttendance: 200,
      preferredLayout: 'THEATRE' as const,
      layoutNotes: 'INTERNAL staging notes',
      accessibilityNotes: 'INTERNAL accessibility planning',
      equipmentNeeds: 'INTERNAL equipment planning',
      registrationEnabled: true,
    };

    const ownedByA = await prisma.eventRequest.create({
      data: {
        ...baseEvent,
        name: 'Event owned by A',
        organiserId: ids.organiserA,
        coordinatorId: ids.coordinatorA,
        status: EventStatus.CONFIRMED,
      },
    });
    ids.eventA = ownedByA.id;

    const ownedByB = await prisma.eventRequest.create({
      data: {
        ...baseEvent,
        name: 'Event owned by B',
        organiserId: ids.organiserB,
        coordinatorId: ids.coordinatorB,
        status: EventStatus.CONFIRMED,
      },
    });
    ids.eventB = ownedByB.id;

    const draft = await prisma.eventRequest.create({
      data: {
        ...baseEvent,
        name: 'Unreviewed draft',
        organiserId: ids.organiserA,
        status: EventStatus.DRAFT,
      },
    });
    ids.draftEvent = draft.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('AC-1: default-deny for undeclared actions', () => {
    it('denies a route that declares no permission, for every role', async () => {
      for (const who of ['organiserA', 'coordinatorA', 'venueStaff', 'attendee']) {
        const res = await http()
          .get(`/events/${ids.eventA}/internal-notes`)
          .set('Authorization', as(who))
          .expect(403);

        expect(res.body.shouldNeverBeReturned).toBeUndefined();
      }
    });

    it('changes nothing when denied', async () => {
      const before = await prisma.eventRequest.findMany();
      await http()
        .get(`/events/${ids.eventA}/internal-notes`)
        .set('Authorization', as( 'attendee'))
        .expect(403);
      const after = await prisma.eventRequest.findMany();

      expect(after).toEqual(before);
    });

    it('denies an event action the role has no grant for', async () => {
      // US-25 gave Venue Staff EVENT/READ at RELATED scope; they still hold
      // nothing else on events.
      await http()
        .post('/events/drafts')
        .set('Authorization', as('venueStaff'))
        .send({ name: 'Not allowed' })
        .expect(403);
    });
  });

  describe('AC-2: granted actions succeed', () => {
    it('lets an Organiser list events', async () => {
      await http().get('/events').set('Authorization', as('organiserA')).expect(200);
    });

    it('lets a Coordinator list events', async () => {
      await http().get('/events').set('Authorization', as('coordinatorA')).expect(200);
    });

    it('lets an Attendee list events', async () => {
      await http().get('/events').set('Authorization', as('attendee')).expect(200);
    });
  });

  describe('AC-3: the server rejects, not the UI', () => {
    it('rejects a direct URL call for an ungranted role', async () => {
      const res = await http()
        .patch(`/events/${ids.eventA}`)
        .set('Authorization', as('venueStaff'))
        .send({ name: 'Hijacked' })
        .expect(403);

      expect(res.body.name).toBeUndefined();
    });

    it('hides an event with no booking from Venue Staff (US-25 RELATED scope)', async () => {
      const res = await http()
        .get(`/events/${ids.eventA}`)
        .set('Authorization', as('venueStaff'))
        .expect(404);

      expect(res.body.name).toBeUndefined();
    });

    it('rejects a direct call for another organiser’s event', async () => {
      const res = await http()
        .get(`/events/${ids.eventB}`)
        .set('Authorization', as('organiserA'))
        .expect(404);

      expect(res.body.name).toBeUndefined();
    });

    it('returns no payload alongside a denial', async () => {
      const res = await http()
        .get(`/events/${ids.eventA}/internal-notes`)
        .set('Authorization', as('attendee'))
        .expect(403);

      expect(Object.keys(res.body)).toEqual(
        expect.arrayContaining(['statusCode', 'message']),
      );
      expect(res.body).not.toHaveProperty('layoutNotes');
    });
  });

  describe('AC-4: the client is told what its role may do', () => {
    it('reports an Attendee’s permitted actions', async () => {
      const res = await http()
        .get('/auth/me/permissions')
        .set('Authorization', as('attendee'))
        .expect(200);

      expect(res.body.role).toBe(Role.ATTENDEE);
      expect(res.body.permissions).toContainEqual({
        resource: 'REGISTRATION',
        action: 'REGISTER',
        scope: 'OWN',
      });
    });

    it('does not advertise actions the role lacks', async () => {
      const res = await http()
        .get('/auth/me/permissions')
        .set('Authorization', as('attendee'))
        .expect(200);

      const resources = res.body.permissions.map((p: { resource: string }) => p.resource);
      expect(resources).not.toContain('BOOKING');
    });

    it('differs per role', async () => {
      const organiser = await http()
        .get('/auth/me/permissions')
        .set('Authorization', as('organiserA'))
        .expect(200);
      const staff = await http()
        .get('/auth/me/permissions')
        .set('Authorization', as('venueStaff'))
        .expect(200);

      expect(organiser.body.permissions).not.toEqual(staff.body.permissions);
    });

    it('matches what the server actually enforces', async () => {
      const staff = await http()
        .get('/auth/me/permissions')
        .set('Authorization', as('venueStaff'))
        .expect(200);

      const eventRead = staff.body.permissions.find(
        (p: { resource: string; action: string }) =>
          p.resource === 'EVENT' && p.action === 'READ',
      );
      expect(eventRead.scope).toBe('RELATED');

      // The advertised RELATED scope and the enforced filter agree: none of
      // the seeded events has a booking, so none is visible.
      const res = await http().get('/events').set('Authorization', as('venueStaff')).expect(200);
      expect(res.body).toEqual([]);
    });

    it('requires authentication', async () => {
      await http().get('/auth/me/permissions').expect(401);
    });
  });

  describe('AC-5: an Organiser sees only their own events', () => {
    it('lists only their own', async () => {
      const res = await http().get('/events').set('Authorization', as('organiserA')).expect(200);

      const names = res.body.map((e: { name: string }) => e.name);
      expect(names).toContain('Event owned by A');
      expect(names).not.toContain('Event owned by B');
    });

    it('denies another organiser’s event by id', async () => {
      await http()
        .get(`/events/${ids.eventB}`)
        .set('Authorization', as('organiserA'))
        .expect(404);
    });

    it('allows their own event by id', async () => {
      const res = await http()
        .get(`/events/${ids.eventA}`)
        .set('Authorization', as('organiserA'))
        .expect(200);

      expect(res.body.name).toBe('Event owned by A');
    });
  });

  describe('AC-6: a Coordinator sees only assigned events', () => {
    it('lists only events assigned to them', async () => {
      const res = await http().get('/events').set('Authorization', as('coordinatorA')).expect(200);

      const names = res.body.map((e: { name: string }) => e.name);
      expect(names).toContain('Event owned by A');
      expect(names).not.toContain('Event owned by B');
    });

    it('denies an event assigned to another coordinator', async () => {
      await http()
        .get(`/events/${ids.eventB}`)
        .set('Authorization', as('coordinatorA'))
        .expect(404);
    });

    it('denies an event with no coordinator assigned', async () => {
      await http()
        .get(`/events/${ids.draftEvent}`)
        .set('Authorization', as('coordinatorA'))
        .expect(404);
    });
  });

  describe('AC-7: an Attendee sees only registration-facing info', () => {
    it('omits internal planning fields', async () => {
      const res = await http()
        .get(`/events/${ids.eventA}`)
        .set('Authorization', as('attendee'))
        .expect(200);

      expect(res.body).not.toHaveProperty('layoutNotes');
      expect(res.body).not.toHaveProperty('accessibilityNotes');
      expect(res.body).not.toHaveProperty('accessibilityRequirements');
      expect(res.body).not.toHaveProperty('equipmentNeeds');
      expect(res.body).not.toHaveProperty('expectedAttendance');
      expect(res.body).not.toHaveProperty('organiserId');
      expect(JSON.stringify(res.body)).not.toMatch(/INTERNAL/);
    });

    it('keeps what registration needs', async () => {
      const res = await http()
        .get(`/events/${ids.eventA}`)
        .set('Authorization', as('attendee'))
        .expect(200);

      expect(res.body).toMatchObject({
        name: 'Event owned by A',
        registrationEnabled: true,
      });
    });

    it('hides events that have not passed review', async () => {
      const res = await http().get('/events').set('Authorization', as('attendee')).expect(200);

      const names = res.body.map((e: { name: string }) => e.name);
      expect(names).not.toContain('Unreviewed draft');
    });

    it('lists confirmed events that are open for registration', async () => {
      const res = await http().get('/events').set('Authorization', as('attendee')).expect(200);

      const names = res.body.map((e: { name: string }) => e.name);
      expect(names).toEqual(
        expect.arrayContaining(['Event owned by A', 'Event owned by B']),
      );
    });

    it('strips internal fields from the list view too', async () => {
      const res = await http().get('/events').set('Authorization', as('attendee')).expect(200);
      expect(res.body.length).toBeGreaterThan(0);

      expect(JSON.stringify(res.body)).not.toMatch(/INTERNAL/);
    });
  });

  describe('AC-8: unauthenticated requests are denied and pointed at login', () => {
    it('denies a protected route with no token', async () => {
      const res = await http().get('/events').expect(401);

      expect(res.body.loginUrl).toBe('/auth/login');
      expect(res.headers['www-authenticate']).toMatch(/Bearer/);
    });

    it('denies a single event with no token', async () => {
      const res = await http().get(`/events/${ids.eventA}`).expect(401);
      expect(res.body.name).toBeUndefined();
    });

    it('denies a forged token', async () => {
      await http()
        .get('/events')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('denies once the session has been logged out', async () => {
      await http().post('/auth/logout').set('Authorization', as('organiserA')).expect(204);
      await http().get('/events').set('Authorization', as('organiserA')).expect(401);
    });
  });
});
