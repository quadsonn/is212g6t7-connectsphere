import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-01 e2e — one describe per acceptance criterion.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql (see docs/testing/sprint1-test-cases.md).
 * The reset runs before EVERY test, so failed-attempt counts and locks
 * (AC-5) can never leak from one test into the next.
 */
describe('US-01 secure login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  /** u-organiser from base-users.sql. */
  const EMAIL = 'organiser@example.com';
  const PASSWORD = 'correct-horse-battery-staple';

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global setup as main.ts (pipes, UnauthorizedFilter, CORS).
    configureApp(app);
    // Bound to 127.0.0.1 explicitly: with init() alone, or a dual-stack [::]
    // listener, the OS can hand out a port another local process already holds
    // on 127.0.0.1, and Supertest then talks to that process (hangs, or
    // "Parse Error: Expected HTTP/").
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
  });

  describe('AC-1: registered user with valid credentials is authenticated', () => {
    // TC-S1-55 · setup: base-users · fails if valid credentials stop issuing a token
    it('returns 200 with an access token', async () => {
      const res = await login(EMAIL, PASSWORD).expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.accessToken.split('.')).toHaveLength(3);
    });

    // TC-S1-55 · setup: base-users · fails if the token no longer identifies the user and role
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

    // TC-S1-55 · setup: base-users · fails if a fresh token cannot open a protected route
    it('establishes a session that opens protected routes', async () => {
      const { body } = await login(EMAIL, PASSWORD).expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
    });
  });

  describe('AC-2: bad credentials are rejected with a generic error', () => {
    // TC-S1-56 · setup: base-users · fails if a wrong password gets a token or a specific message
    it('rejects a wrong password with 401 and no token', async () => {
      const res = await login(EMAIL, 'wrong-password').expect(401);

      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.message).toBe('invalid email or password');
    });

    // TC-S1-56 · setup: base-users · fails if an unknown email gets a token or a specific message
    it('rejects an unknown email with 401 and no token', async () => {
      const res = await login('nobody@example.com', PASSWORD).expect(401);

      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.message).toBe('invalid email or password');
    });

    // TC-S1-56 · setup: base-users · fails if the two failures can be told apart
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
    // TC-S1-57 · setup: base-users · fails if a protected route answers without a token
    it('rejects a request with no token', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me').expect(401);
      expect(res.body.userId).toBeUndefined();
    });

    // TC-S1-57 · setup: base-users · fails if a malformed token is accepted
    it('rejects a malformed token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    // TC-S1-57 · setup: base-users · fails if a forged token is accepted
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

    // TC-S1-57 · setup: base-users · fails if logout works unauthenticated
    it('rejects logout without a token', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });
  });

  describe('AC-4: logout terminates the session', () => {
    // TC-S1-59 · setup: base-users · fails if a logged-out token still works
    it('returns 204 and makes the token unusable afterwards', async () => {
      const { body } = await login(EMAIL, PASSWORD).expect(200);
      const auth = `Bearer ${body.accessToken}`;

      await request(app.getHttpServer()).get('/auth/me').set('Authorization', auth).expect(200);
      await request(app.getHttpServer()).post('/auth/logout').set('Authorization', auth).expect(204);
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', auth).expect(401);
    });

    // TC-S1-59 · setup: base-users · fails if a new login cannot restore access
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

    // TC-S1-59 · setup: base-users · fails if logout revokes more than its own token
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
    // TC-S1-60 · setup: base-users · fails if the account locks before the 15th failure
    it('stays open for the first 14 failures', async () => {
      for (let i = 0; i < 14; i++) {
        await login(EMAIL, 'wrong-password').expect(401);
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.failedLoginAttempts).toBe(14);
      expect(user.lockedUntil).toBeNull();

      await login(EMAIL, PASSWORD).expect(200);
    });

    // TC-S1-60 · setup: base-users · fails if the 15th failure does not lock or the helpline message is missing
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

    // TC-S1-60 · setup: base-users · fails if a locked account accepts the correct password
    it('refuses the correct password while locked', async () => {
      for (let i = 0; i < 15; i++) {
        await login(EMAIL, 'wrong-password').expect(401);
      }

      const res = await login(EMAIL, PASSWORD).expect(429);
      expect(res.body.accessToken).toBeUndefined();
    });

    // TC-S1-62 · setup: base-users · fails if non-consecutive failures still count toward the lock
    it('resets the count after a successful login', async () => {
      for (let i = 0; i < 5; i++) {
        await login(EMAIL, 'wrong-password').expect(401);
      }
      await login(EMAIL, PASSWORD).expect(200);

      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.failedWindowStartedAt).toBeNull();
    });

    // TC-S1-62 · setup: base-users · fails if the lock is permanent rather than temporary
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

  describe('AC-5: the 30-minute window edge (frozen clock)', () => {
    // Date only: Supertest, Prisma and pg keep their real timers.
    const freezeAt = (instant: number) =>
      jest.useFakeTimers({
        now: instant,
        doNotFake: [
          'nextTick',
          'queueMicrotask',
          'setImmediate',
          'clearImmediate',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'hrtime',
          'performance',
        ],
      });

    afterEach(() => jest.useRealTimers());

    // TC-S1-61 · setup: base-users · fails if failures spread beyond 30 minutes still lock the account
    it('does not lock when the 15 failures are spread beyond 30 minutes', async () => {
      const t0 = Date.now();
      freezeAt(t0);
      for (let i = 0; i < 14; i++) {
        await login(EMAIL, 'wrong-password').expect(401);
      }

      // The 15th failure lands 1 ms after the window that began at the first.
      jest.setSystemTime(t0 + 30 * 60_000 + 1);
      const fifteenth = await login(EMAIL, 'wrong-password').expect(401);
      expect(fifteenth.body.message).toBe('invalid email or password');

      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.failedLoginAttempts).toBe(1);
      expect(user.lockedUntil).toBeNull();

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
