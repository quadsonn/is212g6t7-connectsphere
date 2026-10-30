import { Logger } from '@nestjs/common';

import { RegistrationNotificationsScheduler } from './registration-notifications.scheduler';
import type { RegistrationNotificationsService } from './registration-notifications.service';

/**
 * US-59 — the every-minute tick runs all three sweeps, and one failing does
 * not stop the others. The sweeps themselves are covered against the test
 * database by test/us59-registration-notices.e2e-spec.ts.
 */
describe('RegistrationNotificationsScheduler.tick (US-59)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  // TC-S4-65, TC-S4-67, TC-S4-69 · US-59 AC-1, AC-3, AC-5 · setup: none (unit) · fails if the tick skips a sweep, or one failing sweep stops the others or escapes
  // Code: RegistrationNotificationsScheduler.tick (try/catch per sweep)
  it('runs the opened, closed and near-capacity sweeps, even when one fails', async () => {
    const notices = {
      notifyOpened: jest.fn().mockRejectedValue(new Error('database away')),
      notifyClosed: jest.fn().mockResolvedValue([]),
      notifyNearCapacity: jest.fn().mockResolvedValue([]),
    };
    const scheduler = new RegistrationNotificationsScheduler(notices as unknown as RegistrationNotificationsService);

    await expect(scheduler.tick()).resolves.toBeUndefined();

    expect(notices.notifyClosed).toHaveBeenCalledTimes(1);
    expect(notices.notifyNearCapacity).toHaveBeenCalledTimes(1);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'registration "opened" notice job failed; it runs again next minute',
      expect.any(Error),
    );
  });
});
