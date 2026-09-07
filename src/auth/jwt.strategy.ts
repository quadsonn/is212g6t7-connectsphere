import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthService, JwtPayload } from './auth.service';

/** What lands on request.user, and what @CurrentUser() returns. */
export interface AuthenticatedUser {
  userId: string;
  role: string;
  jti: string;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? '',
    });
  }

  /**
   * Runs only after the signature and expiry have been verified. The
   * revocation lookup here is what makes logout (AC-4) actually terminate the
   * session — without it a signed token stays usable until it expires.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (await this.authService.isTokenRevoked(payload.jti)) {
      throw new UnauthorizedException('session has ended, please log in again');
    }

    return {
      userId: payload.sub,
      role: payload.role,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
