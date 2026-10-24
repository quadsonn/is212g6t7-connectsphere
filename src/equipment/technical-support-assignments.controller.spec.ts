import { Role } from '@prisma/client';

import { PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { EventsController } from '../events/events.controller';
import { TechnicalSupportAssignmentsController } from './technical-support-assignments.controller';

/** US-61 — who may use each side of the assignment, read from route metadata. */
describe('Technical Support assignment access (US-61)', () => {
  it('US-61 AC-3: the assignment list is restricted to TECHNICAL_SUPPORT_STAFF alone', () => {
    expect(Reflect.getMetadata(ROLES_KEY, TechnicalSupportAssignmentsController)).toEqual([
      Role.TECHNICAL_SUPPORT_STAFF,
    ]);
    expect(Reflect.getMetadata(PERMISSION_KEY, TechnicalSupportAssignmentsController)).toBeUndefined();
  });

  it.each(['getTechnicalSupport', 'assignTechnicalSupport', 'unassignTechnicalSupport'])(
    'US-61: %s is restricted to EVENT_COORDINATOR alone',
    (name) => {
      const handler = (EventsController.prototype as unknown as Record<string, object>)[name];

      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.EVENT_COORDINATOR]);
      expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBeUndefined();
    },
  );
});
