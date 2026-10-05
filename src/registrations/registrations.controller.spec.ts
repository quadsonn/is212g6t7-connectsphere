import { Role } from '@prisma/client';

import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RegistrationsController } from './registrations.controller';

/** CLAUDE.md §6 — every protected endpoint declares its required roles. */
describe('RegistrationsController', () => {
  const routes = Object.getOwnPropertyNames(
    RegistrationsController.prototype,
  ).filter((name) => name !== 'constructor');

  it('has routes to check', () => {
    expect(routes.sort()).toEqual(
      ['findMine', 'findOne', 'getOptions', 'register', 'withdraw'].sort(),
    );
  });

  it.each(routes)('%s is restricted to Attendees', (name) => {
    const handler = (
      RegistrationsController.prototype as unknown as Record<string, unknown>
    )[name] as object;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.ATTENDEE]);
  });
});
