import { Logger } from '@nestjs/common';

import { HoldExpiryScheduler } from './hold-expiry.scheduler';
import type { HoldNotifier } from './hold-notifier';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * US-54 AC-6/AC-7 — the every-minute tick runs both hold jobs, and one failing
 * does not stop the other. The jobs themselves are covered against the test
 * database by test/us54-venue-holds.e2e-spec.ts.
 */
describe('HoldExpiryScheduler.tick (US-54)', () => {
  const scheduler = () => new HoldExpiryScheduler({} as PrismaService, {} as HoldNotifier);

  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  // TC-S3-157, TC-S3-158 · US-54 AC-6, AC-7 · setup: none (unit) · fails if the tick skips either job
  // Code: HoldExpiryScheduler.tick
  it('releases due holds and sends warnings', async () => {
    const s = scheduler();
    const expire = jest.spyOn(s, 'expireDueHolds').mockResolvedValue(undefined as never);
    const warn = jest.spyOn(s, 'sendExpiryWarnings').mockResolvedValue(undefined as never);

    await s.tick();

    expect(expire).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  // TC-S3-157, TC-S3-158 · US-54 AC-6, AC-7 · setup: none (unit) · fails if a failing expiry job stops the warnings or escapes the tick
  // Code: HoldExpiryScheduler.tick (try/catch per job)
  it('still sends warnings when the expiry job fails, and logs the failure', async () => {
    const s = scheduler();
    jest.spyOn(s, 'expireDueHolds').mockRejectedValue(new Error('database away'));
    const warn = jest.spyOn(s, 'sendExpiryWarnings').mockResolvedValue(undefined as never);

    await expect(s.tick()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'hold expiry job failed; it runs again next minute',
      expect.any(Error),
    );
  });
});
