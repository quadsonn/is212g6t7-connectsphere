import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { isPermitted } from '../access/permission-matrix';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '../decorators/require-permission.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../../auth/jwt.strategy';

/**
 * US-02 — DEFAULT-DENY authorisation.
 *
 * A route this guard protects is denied unless it declares what it needs, via
 * @RequirePermission (checked against the matrix) or @Roles (an explicit
 * list). Forgetting to declare produces a 403, never an accidental allow —
 * the failure mode is a visibly broken endpoint rather than a silent hole.
 *
 * This guard answers "may this role do this at all?". Whether the user may
 * touch a *specific record* is an ownership question, and lives in
 * AccessControlService (CLAUDE.md §6).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    const permission = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      targets,
    );
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    // AC-8: no authenticated principal, nothing to authorise.
    if (!user) {
      throw new UnauthorizedException('authentication required');
    }

    const role = user.role as Role;

    if (permission) {
      if (!isPermitted(role, permission.resource, permission.action)) {
        throw new ForbiddenException(
          `role ${role} may not ${permission.action} ${permission.resource}`,
        );
      }
      return true;
    }

    if (roles) {
      if (!roles.includes(role)) {
        throw new ForbiddenException(`role ${role} is not permitted here`);
      }
      return true;
    }

    // AC-1: an undeclared route is denied, not allowed.
    throw new ForbiddenException(
      'no permission declared for this route; access denied by default',
    );
  }
}
