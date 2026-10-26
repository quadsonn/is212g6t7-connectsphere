import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NotificationType } from '@prisma/client';

/**
 * Every notification is shown with a title for its type (frontend
 * notification-title.ts). A type added to the schema without one would fall
 * back to the generic "Notification", so this fails until it is given a title.
 */
describe('Notification titles', () => {
  const source = readFileSync(
    join(__dirname, '../../frontend/src/features/notifications/notification-title.ts'),
    'utf8',
  );

  it.each(Object.values(NotificationType))('%s has a title in the frontend', (type) => {
    expect(source).toMatch(new RegExp(`^\\s+${type}: '[^']+',$`, 'm'));
  });
});
