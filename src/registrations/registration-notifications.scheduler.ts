import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RegistrationNotificationsService } from './registration-notifications.service';

/**
 * US — every minute, send the registration-window notices that have come due:
 * an event that has become visible to attendees (opened), one whose window has
 * closed, and one that has reached 10 or fewer seats left.
 *
 * Like the hold-expiry job, correctness does not rely on the exact tick: each
 * notice is claimed once per event (RegistrationNotificationsService), so
 * running late, twice, or on two instances still sends it once.
 *
 * ScheduleModule is not registered under test (app.module.ts), so tests call
 * the service's methods directly.
 */
@Injectable()
export class RegistrationNotificationsScheduler {
  private readonly logger = new Logger(RegistrationNotificationsScheduler.name);

  constructor(private readonly notices: RegistrationNotificationsService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'registration-window-notices' })
  async tick(): Promise<void> {
    // Separately, so one failing does not stop the others.
    for (const [name, job] of [
      ['opened', () => this.notices.notifyOpened()],
      ['closed', () => this.notices.notifyClosed()],
      ['near-capacity', () => this.notices.notifyNearCapacity()],
    ] as const) {
      try {
        await job();
      } catch (error) {
        this.logger.error(
          `registration "${name}" notice job failed; it runs again next minute`,
          error as Error,
        );
      }
    }
  }
}
