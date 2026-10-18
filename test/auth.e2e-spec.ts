import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-01 e2e — one describe per acceptance criterion (CLAUDE.md §10).
 * Runs against the dedicated test database configured in test/e2e-env.ts.
 */
describe('US-01 secure login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const EMAIL = 'organiser@example.com';
  const PASSWORD = 'correct-horse-battery-staple';

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors main.ts so DTO validation behaves as it does in production.
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
    // EventRequest.organiserId is onDelete: Restrict, so events must go first.
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: {
        email: EMAIL,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        name: 'Test Organiser',
        role: 'EVENT_ORGANISER',
      },
    });
  });

  describe('AC-1: registered user with valid credentials is authenticated', () => {
    it('returns 200 with an access token', async () => {
      const res = await login(EMAIL, PASSWORD).expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.accessToken.split('.')).toHaveLength(3);
    });

    it('issues a token carrying userId and role', async () => {
      const res = await login(EMAIL, PASSWORD).expect(200);

      const claims = JSON.parse(
        Buffer.from(res.body.accessToken.split('.')[1], 'base64').toString(),
      );
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: EMAIL },
      });

      expect(claims.sub).toBe(user.id);
      expect(claims.role).toBe('EVENT_ORGANISER');
    });

    it('establishes a session that opens protected routes', async () => {
      const { body } = await login(EMAIL, PASSWORD).expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
    });
  });

  describe('AC-2: bad credentials are rejected with a generic error', () => {
    it('rejects a wrong password with 401 and no token', async () => {
      const res = await login(EMAIL, 'wrong-password').expect(401);

      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.message).toBe('invalid email or password');
    });

    it('rejects an unknown email with 401 and no token', async () => {
      const res = await login('nobody@example.com', PASSWORD).expect(401);

      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.message).toBe('invalid email or password');
    });

    it('returns byte-identical bodies for both, revealing neither field', async () => {
      const wrongPassword = await login(EMAIL, 'wrong-password').expect(401);
      const unknownEmail = await login('nobody@example.com', PASSWORD).expect(401);

      // The generic message necessarily mentions both fields; what matters is
      // that the two responses are indistinguishable and neither says which
      // one was wrong.
      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.status).toBe(unknownEmail.status);
      expect(JSON.stringify(wrongPassword.body)).not.toMatch(
        /incorrect password|wrong password|unknown email|no such user|not (found|registered)|does not exist/i,
      );
    });
  });

  describe('AC-3: unauthenticated users cannot reach protected routes', () => {
    it('rejects a request with no token', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me').expect(401);
      expect(res.body.userId).toBeUndefined();
    });

    it('rejects a malformed token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('rejects a token signed with the wrong secret', async () => {
      const forged = [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify({ sub: 'user-1', role: 'ATTENDEE' })).toString('base64url'),
        'forged-signature',
      ].join('.');

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('rejects logout without a token', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });
  });

  describe('AC-4: logout terminates the session', () => {
    it('returns 204 and makes the token unusable afterwards', async () => {
      const { body } = await login(EMAIL, PASSWORD).expect(200);
      const auth = `Bearer ${body.accessToken}`;

      await request(app.getHttpServer()).get('/auth/me').set('Authorization', auth).expect(200);
      await request(app.getHttpServer()).post('/auth/logout').set('Authorization', auth).expect(204);
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', auth).expect(401);
    });

    it('requires logging in again to regain access', async () => {
      const first = await login(EMAIL, PASSWORD).expect(200);
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${first.body.accessToken}`)
        .expect(204);

      const second = await login(EMAIL, PASSWORD).expect(200);
      expect(second.body.accessToken).not.toBe(first.body.accessToken);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${second.body.accessToken}`)
        .expect(200);
    });

    it('does not revoke other sessions belonging to the same user', async () => {
      const sessionA = await login(EMAIL, PASSWORD).expect(200);
      const sessionB = await login(EMAIL, PASSWORD).expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${sessionA.body.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${sessionB.body.accessToken}`)
        .expect(200);
    });
  });

  describe('AC-5: 15 failures in 30 minutes locks the account', () => {
    it('stays open for the first 14 failures', async () => {
      for (let i = 0; i < 14; i++) {
        await login(EMAIL, 'wrong-password').expect(401);
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.failedLoginAttempts).toBe(14);
      expect(user.lockedUntil).toBeNull();

      await login(EMAIL, PASSWORD).expect(200);
    });

    it('locks on the 15th and points the user at the helpline', async () => {
      for (let i = 0; i < 14; i++) {
        await login(EMAIL, 'wrong-password').expect(401);
      }

      const fifteenth = await login(EMAIL, 'wrong-password').expect(401);
      expect(fifteenth.body.message).toBe('invalid email or password');

      const locked = await login(EMAIL, 'wrong-password').expect(429);
      expect(locked.body.message).toMatch(/helpline/i);
      expect(locked.body.accessToken).toBeUndefined();
    });

    it('refuses the correct password while locked', async () => {
      for (let i = 0; i < 15; i++) {
        await login(EMAIL, 'wrong-password').expect(401);
      }

      const res = await login(EMAIL, PASSWORD).expect(429);
      expect(res.body.accessToken).toBeUndefined();
    });

    it('resets the count after a successful login', async () => {
      for (let i = 0; i < 5; i++) {
        await login(EMAIL, 'wrong-password').expect(401);
      }
      await login(EMAIL, PASSWORD).expect(200);

      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.failedWindowStartedAt).toBeNull();
    });

    it('unlocks once the lock period has elapsed', async () => {
      for (let i = 0; i < 15; i++) {
        await login(EMAIL, 'wrong-password').expect(401);
      }
      await login(EMAIL, PASSWORD).expect(429);

      await prisma.user.update({
        where: { email: EMAIL },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });

      await login(EMAIL, PASSWORD).expect(200);
    });
  });

  describe('DTO validation', () => {
    it('rejects a malformed email with 400', async () => {
      await login('not-an-email', PASSWORD).expect(400);
    });

    it('rejects an empty password with 400', async () => {
      await login(EMAIL, '').expect(400);
    });

    it('ignores unexpected fields rather than trusting them', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: EMAIL, password: PASSWORD, role: 'EVENT_COORDINATOR' })
        .expect(200);
    });
  });
});
