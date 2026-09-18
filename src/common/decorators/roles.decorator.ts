import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to specific roles (CLAUDE.md §6: every protected endpoint
 * declares its required roles).
 *
 * Prefer @RequirePermission — it consults the matrix, so it cannot drift from
 * it. Where an explicit role list reads better, derive it with
 * rolesWithPermission() rather than typing role names by hand.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
