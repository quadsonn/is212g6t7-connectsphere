import type { Prisma } from '@prisma/client';

import { releaseExpiredHolds, sendHoldWarnings } from './hold-expiry';
import type { HoldNotifier } from './hold-notifier';

/**
 * US-54 AC-6/AC-7 — the two hold jobs as the scheduler calls them: with no
 * venue and no time given, they sweep every venue as of now. What they release
 * and warn about is proven against the test database by
 * test/us54-venue-holds.e2e-spec.ts.
 */
describe('hold expiry jobs (US-54), called with the defaults', () => {
  const notifier = { expired: jest.fn(), expiring: jest.fn() } as unknown as HoldNotifier;

  // TC-S3-157 · US-54 AC-6 · setup: none (unit) · fails if the expiry job cannot run without a venue or a time, or sweeps only one venue
  // Code: releaseExpiredHolds (default scope and now)
  it('releases across every venue, as of now, when called with no scope or time', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };

    await expect(releaseExpiredHolds(tx as unknown as Prisma.TransactionClient, notifier)).resolves.toEqual([]);

    const sql = (tx.$queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).not.toContain('AND "venueId"');
  });

  // TC-S3-158 · US-54 AC-7 · setup: none (unit) · fails if the warning job cannot run without a time
  // Code: sendHoldWarnings (default now)
  it('sends warnings as of now when called with no time', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };

    await expect(sendHoldWarnings(tx as unknown as Prisma.TransactionClient, notifier)).resolves.toEqual([]);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
