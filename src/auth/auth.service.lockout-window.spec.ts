import { HttpStatus, HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNT_LOCKED_MESSAGE } from './auth.constants';
import { AuthService } from './auth.service';

/**
 * TC-S1-61 — US-01 AC-5 window edge: "15 consecutive attempts within 30
 * minutes". The clock is frozen (Date only; bcrypt's native callbacks keep
 * running), so the edge is tested to the millisecond with no real waiting.
 */
describe('AuthService lockout window edge (TC-S1-61, US-01 AC-5)', () => {
  const T0 = new Date('2030-06-01T12:00:00.000Z');
  const MINUTE = 60_000;
  const PASSWORD = 'correct-horse-battery-staple';
  let passwordHash: string;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let service: AuthService;

  /** A user whose first failure was at T0 and who has failed 14 times since. */
  const fourteenFailuresSinceT0 = () => ({
    id: 'u-organiser',
    email: 'organiser@example.com',
    passwordHash,
    role: 'EVENT_ORGANISER',
    failedLoginAttempts: 14,
    failedWindowStartedAt: T0,
    lockedUntil: null,
  });

  const failAt = async (offsetMs: number) => {
    jest.setSystemTime(new Date(T0.getTime() + offsetMs));
    return service
      .login({ email: 'organiser@example.com', password: 'wrong-password' })
      .catch((e: unknown) => e);
  };

  const written = () => prisma.user.update.mock.calls[0][0].data;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    jest.useFakeTimers({
      now: T0,
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setTimeout', 'setInterval', 'hrtime', 'performance'],
    });
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(fourteenFailuresSinceT0()),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      { signAsync: jest.fn().mockResolvedValue('jwt') } as unknown as JwtService,
      { get: () => undefined } as unknown as ConfigService,
    );
  });

  afterEach(() => jest.useRealTimers());

  // TC-S1-61 · fails if a 15th failure exactly 30 minutes after the first no longer locks
  it('locks when the 15th failure lands exactly 30 minutes after the first (still within the window)', async () => {
    const error = await failAt(30 * MINUTE);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(written().failedLoginAttempts).toBe(15);
    expect(written().lockedUntil).toEqual(new Date(T0.getTime() + 60 * MINUTE));
  });

  // TC-S1-61 · fails if failures spread beyond 30 minutes are still counted together
  it('does not lock when the 15th failure lands 1 ms after the window closes; the count restarts at 1', async () => {
    const error = await failAt(30 * MINUTE + 1);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(written()).toEqual({
      failedLoginAttempts: 1,
      failedWindowStartedAt: new Date(T0.getTime() + 30 * MINUTE + 1),
      lockedUntil: null,
    });
  });

  // TC-S1-61 · fails if a lock that is still in force stops refusing the correct password
  it('refuses the correct password with the helpline message while a lock is in force', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...fourteenFailuresSinceT0(),
      failedLoginAttempts: 15,
      lockedUntil: new Date(T0.getTime() + 30 * MINUTE),
    });
    jest.setSystemTime(new Date(T0.getTime() + 30 * MINUTE - 1));

    const error = (await service
      .login({ email: 'organiser@example.com', password: PASSWORD })
      .catch((e: HttpException) => e)) as HttpException;

    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(error.message).toBe(ACCOUNT_LOCKED_MESSAGE);
  });
});
