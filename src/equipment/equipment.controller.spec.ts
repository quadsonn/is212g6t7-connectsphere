import { Role } from '@prisma/client';
import { PATH_METADATA } from '@nestjs/common/constants';

import { PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { EquipmentController } from './equipment.controller';

/**
 * US-28 to US-32 — only Technical Support Staff may use these features,
 * enforced server-side. Reads the route metadata, so a route added later
 * without the restriction fails here rather than silently opening up.
 */
describe('EquipmentController access (US-28–US-32)', () => {
  const proto = EquipmentController.prototype as unknown as Record<string, unknown>;
  const handlers = Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .filter((name) => Reflect.getMetadata(PATH_METADATA, proto[name] as object) !== undefined);

  it('finds every route handler (guards against a vacuous scan)', () => {
    expect(handlers.sort()).toEqual(
      [
        'checkAvailability',
        'commit',
        'findAll',
        'findEventDetails',
        'findOne',
        'findReleased',
        'findRequirements',
        'findRequirementsForEvent',
      ].sort(),
    );
  });

  it.each([
    'checkAvailability',
    'commit',
    'findAll',
    'findEventDetails',
    'findOne',
    'findReleased',
    'findRequirements',
    'findRequirementsForEvent',
  ])('%s is restricted to TECHNICAL_SUPPORT_STAFF alone', (name) => {
    const handler = proto[name] as object;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      Role.TECHNICAL_SUPPORT_STAFF,
    ]);
    // A permission gate would take precedence in RolesGuard and admit any
    // role holding the grant (Coordinators hold EQUIPMENT/READ).
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBeUndefined();
  });
});
