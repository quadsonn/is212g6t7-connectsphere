import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * AC-3: rejects any request to a protected route that has no valid,
 * unrevoked bearer token, with 401 and no payload.
 *
 * Authentication only — role checks are US-02's RolesGuard.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
