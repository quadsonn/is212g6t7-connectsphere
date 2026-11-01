import { Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsInboxService } from './notifications-inbox.service';

/**
 * US-40 AC-5 — the inbox when called with no page at all. Paging, ordering
 * and ownership are proven end to end in test/us40-venue-notifications.e2e-spec.ts
 * and test/notifications.e2e-spec.ts.
 */
describe('US-40 NotificationsInboxService.list', () => {
  // TC-S3-61 · US-40 AC-5 · setup: none (unit) · fails if the inbox cannot be read without a page, or reads anything but the caller's own, newest first
  // Code: NotificationsInboxService.list (default page)
  it("reads the caller's own notifications, newest first, with the default page size when given no page", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new NotificationsInboxService(
      { notification: { findMany } } as unknown as PrismaService,
      { requireScope: jest.fn() } as unknown as AccessControlService,
    );

    await expect(service.list({ userId: 'USR-010', role: Role.VENUE_STAFF } as AuthenticatedUser)).resolves.toEqual([]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: 'USR-010' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: expect.any(Number),
      }),
    );
    expect(findMany.mock.calls[0][0]).not.toHaveProperty('cursor');
  });
});
