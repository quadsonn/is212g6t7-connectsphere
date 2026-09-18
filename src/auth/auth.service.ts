import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import {
  AUTH_DEFAULTS,
  ACCOUNT_LOCKED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';

export interface JwtPayload {
  /** Standard JWT subject claim — the user id (CLAUDE.md §6). */
  sub: string;
  role: string;
  /** Token id, so an individual token can be revoked on logout (AC-4). */
  jti: string;
  iat?: number;
  exp?: number;
}

/**
 * A bcrypt hash of a value nobody can supply. Compared against when the email
 * does not exist, so a missing account costs the same time as a wrong
 * password — otherwise response timing leaks which emails are registered,
 * defeating the point of the generic message in AC-2.
 */
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * AC-1 / AC-2 / AC-5.
   *
   * Order matters: the lock is checked before the password, so a locked
   * account cannot be probed by supplying the correct password.
   */
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (user) {
      this.assertNotLocked(user);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !passwordMatches) {
      if (user) {
        await this.recordFailedAttempt(user);
      }
      // AC-2: identical response whether the email is unknown or the
      // password is wrong.
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    await this.resetFailedAttempts(user);

    return { accessToken: await this.issueToken(user) };
  }

  /**
   * AC-4. Records the token's jti so the guard will reject it for the
   * remainder of its lifetime.
   */
  async logout(payload: JwtPayload): Promise<void> {
    const expiresAt = payload.exp
      ? new Date(payload.exp * 1000)
      : new Date(Date.now() + this.tokenLifetimeMs());

    await this.prisma.revokedToken.upsert({
      where: { jti: payload.jti },
      create: { jti: payload.jti, userId: payload.sub, expiresAt },
      update: {},
    });
  }

  /** Used by the JWT strategy on every protected request (AC-4). */
  async isTokenRevoked(jti: string): Promise<boolean> {
    const revoked = await this.prisma.revokedToken.findUnique({
      where: { jti },
    });
    return revoked !== null;
  }

  private async issueToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      jti: randomUUID(),
    };
    return this.jwt.signAsync(payload);
  }

  /**
   * AC-5. Throws once the account is locked. Expired locks clear themselves
   * on the next attempt rather than needing a scheduled job.
   */
  private assertNotLocked(user: User): void {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        ACCOUNT_LOCKED_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * AC-5. Counts failures over a trailing window: if the window has elapsed
   * since the first failure, the count restarts at one.
   */
  private async recordFailedAttempt(user: User): Promise<void> {
    const now = new Date();
    const windowMs = this.numberFrom(
      'LOGIN_FAILED_WINDOW_MINUTES',
      AUTH_DEFAULTS.failedWindowMinutes,
    ) * 60_000;
    const maxAttempts = this.numberFrom(
      'LOGIN_MAX_FAILED_ATTEMPTS',
      AUTH_DEFAULTS.maxFailedAttempts,
    );
    const lockoutMs = this.numberFrom(
      'LOGIN_LOCKOUT_MINUTES',
      AUTH_DEFAULTS.lockoutMinutes,
    ) * 60_000;

    const windowExpired =
      !user.failedWindowStartedAt ||
      now.getTime() - user.failedWindowStartedAt.getTime() > windowMs;

    const attempts = windowExpired ? 1 : user.failedLoginAttempts + 1;
    const windowStartedAt = windowExpired ? now : user.failedWindowStartedAt;
    const locked = attempts >= maxAttempts;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        failedWindowStartedAt: windowStartedAt,
        lockedUntil: locked ? new Date(now.getTime() + lockoutMs) : null,
      },
    });
  }

  /** A successful login ends the "consecutive" run in AC-5. */
  private async resetFailedAttempts(user: User): Promise<void> {
    if (
      user.failedLoginAttempts === 0 &&
      user.failedWindowStartedAt === null &&
      user.lockedUntil === null
    ) {
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        failedWindowStartedAt: null,
        lockedUntil: null,
      },
    });
  }

  private tokenLifetimeMs(): number {
    const raw = this.config.get<string>('JWT_EXPIRES_IN') ?? '1h';
    const match = /^(\d+)([smhd])$/.exec(raw.trim());
    if (!match) {
      return 3_600_000;
    }
    const value = Number(match[1]);
    const unitMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * unitMs[match[2] as keyof typeof unitMs];
  }

  private numberFrom(key: string, fallback: number): number {
    const parsed = Number(this.config.get<string>(key));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
