import { HttpStatus, UnauthorizedException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService, JwtPayload } from './auth.service';
import {
  ACCOUNT_LOCKED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
} from './auth.constants';

/**
 * US-01 unit tests — business rules only. Each describe block names the
 * acceptance criterion it verifies (CLAUDE.md §10).
 */
describe('AuthService (US-01)', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    revokedToken: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let jwt: { signAsync: jest.Mock };

  const PASSWORD = 'correct-horse-battery-staple';
  let passwordHash: string;

  const buildUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'user-1',
    email: 'organiser@example.com',
    passwordHash,
    name: 'Test Organiser',
    role: 'EVENT_ORGANISER',
    failedLoginAttempts: 0,
    failedWindowStartedAt: null,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 10);
  });

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      revokedToken: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  // TC-S1-55 · US-01 AC-1 · unit: AuthService.login() with Prisma, bcrypt and JwtService mocked ·
  // fails if valid credentials no longer produce a signed token for that user and role
  describe('AC-1: valid credentials establish a session', () => {
    it('returns an access token', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      const result = await service.login({
        email: 'organiser@example.com',
        password: PASSWORD,
      });

      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    });

    it('signs a payload carrying the user id and role', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await service.login({
        email: 'organiser@example.com',
        password: PASSWORD,
      });

      const payload = jwt.signAsync.mock.calls[0][0] as JwtPayload;
      expect(payload.sub).toBe('user-1');
      expect(payload.role).toBe('EVENT_ORGANISER');
      expect(payload.jti).toEqual(expect.any(String));
    });

    it('clears any accumulated failed attempts', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ failedLoginAttempts: 4, failedWindowStartedAt: new Date() }),
      );

      await service.login({
        email: 'organiser@example.com',
        password: PASSWORD,
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          failedLoginAttempts: 0,
          failedWindowStartedAt: null,
          lockedUntil: null,
        },
      });
    });
  });

  // TC-S1-56 · US-01 AC-2 · unit · fails if a wrong password or unknown email is told apart, or
  // issues a token
  describe('AC-2: wrong credentials are rejected generically', () => {
    it('rejects a wrong password without issuing a token', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await expect(
        service.login({
          email: 'organiser@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('rejects an unknown email without issuing a token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);

      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('returns an identical message for both failures, revealing neither field', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      const wrongPassword = await service
        .login({ email: 'organiser@example.com', password: 'nope' })
        .catch((e: Error) => e.message);

      prisma.user.findUnique.mockResolvedValue(null);
      const unknownEmail = await service
        .login({ email: 'nobody@example.com', password: PASSWORD })
        .catch((e: Error) => e.message);

      expect(wrongPassword).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(unknownEmail).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(wrongPassword).toBe(unknownEmail);
    });
  });

  // TC-S1-60, TC-S1-62 · US-01 AC-5 · unit: recordFailedAttempt()/assertNotLocked() · fails if the
  // 15/30-minute rule, the helpline message or the temporary unlock changes
  describe('AC-5: lockout after 15 failures in 30 minutes', () => {
    it('counts a failure without locking below the threshold', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ failedLoginAttempts: 3, failedWindowStartedAt: new Date() }),
      );

      await service
        .login({ email: 'organiser@example.com', password: 'wrong' })
        .catch(() => undefined);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 4,
            lockedUntil: null,
          }),
        }),
      );
    });

    it('locks the account on the 15th consecutive failure', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({
          failedLoginAttempts: 14,
          failedWindowStartedAt: new Date(),
        }),
      );

      await service
        .login({ email: 'organiser@example.com', password: 'wrong' })
        .catch(() => undefined);

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data.failedLoginAttempts).toBe(15);
      expect(data.lockedUntil).toBeInstanceOf(Date);
      expect(data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('restarts the count when the 30-minute window has elapsed', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({
          failedLoginAttempts: 14,
          failedWindowStartedAt: new Date(Date.now() - 31 * 60_000),
        }),
      );

      await service
        .login({ email: 'organiser@example.com', password: 'wrong' })
        .catch(() => undefined);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 1,
            lockedUntil: null,
          }),
        }),
      );
    });

    it('refuses a locked account and names the helpline', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ lockedUntil: new Date(Date.now() + 10 * 60_000) }),
      );

      const error = (await service
        .login({ email: 'organiser@example.com', password: PASSWORD })
        .catch((e: HttpException) => e)) as HttpException;

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(error.message).toBe(ACCOUNT_LOCKED_MESSAGE);
      expect(error.message).toMatch(/helpline/i);
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('refuses a locked account even when the password is correct', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ lockedUntil: new Date(Date.now() + 10 * 60_000) }),
      );

      await expect(
        service.login({
          email: 'organiser@example.com',
          password: PASSWORD,
        }),
      ).rejects.toThrow(ACCOUNT_LOCKED_MESSAGE);
    });

    it('allows login again once the lock has expired', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({
          lockedUntil: new Date(Date.now() - 60_000),
          failedLoginAttempts: 15,
        }),
      );

      await expect(
        service.login({
          email: 'organiser@example.com',
          password: PASSWORD,
        }),
      ).resolves.toEqual({ accessToken: 'signed.jwt.token' });
    });
  });

  // TC-S1-59 · US-01 AC-4 · unit: logout()/isTokenRevoked() · fails if logging out no longer stores
  // the jti that JwtStrategy refuses
  describe('AC-4: logout revokes the presented token', () => {
    it('stores the jti so the token can no longer be used', async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;

      await service.logout({
        sub: 'user-1',
        role: 'EVENT_ORGANISER',
        jti: 'token-abc',
        exp,
      });

      expect(prisma.revokedToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jti: 'token-abc' },
          create: expect.objectContaining({
            jti: 'token-abc',
            userId: 'user-1',
          }),
        }),
      );
    });

    it('reports a revoked token as revoked', async () => {
      prisma.revokedToken.findUnique.mockResolvedValue({ jti: 'token-abc' });
      await expect(service.isTokenRevoked('token-abc')).resolves.toBe(true);
    });

    it('reports an untouched token as active', async () => {
      prisma.revokedToken.findUnique.mockResolvedValue(null);
      await expect(service.isTokenRevoked('token-xyz')).resolves.toBe(false);
    });
  });
});
