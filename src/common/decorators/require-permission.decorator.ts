import { SetMetadata } from '@nestjs/common';

import { Action, Resource } from '../access/permission.types';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
  resource: Resource;
  action: Action;
}

/**
 * Declares the matrix entry a route requires. RolesGuard resolves it against
 * PERMISSIONS and denies when there is no grant.
 */
export const RequirePermission = (resource: Resource, action: Action) =>
  SetMetadata(PERMISSION_KEY, { resource, action } as RequiredPermission);
