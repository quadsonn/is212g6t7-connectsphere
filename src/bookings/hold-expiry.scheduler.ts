import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { releaseExpiredHolds, sendHoldWarnings } from './hold-expiry';
import { HoldNotifier } from './hold-notifier';

/**
 * US-54 AC-6/AC-7 — every minute, release expired holds and send 24-hour
 * warnings.
 *
 * Correctness does not depend on this: an expired hold is already free to
 * every query (isLiveHold), and writes on its venue release it first. This
 * job makes the release — and its notices — happen even when nobody touches
 * the venue.
 *
 * Several backend instances share one database (every teammate's local
 * server), so each job is one conditional UPDATE ... RETURNING in its own
 * transaction, notifying only for the rows it returned: running it twice, or
 * on two instances at once, notifies once (hold-expiry.ts).
 *
 * ScheduleModule is not registered under test (app.module.ts), so tests call
 * the two jobs directly.
 */
@Injectable()
export class HoldExpiryScheduler {
  private readonly logger = new Logger(HoldExpiryScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: HoldNotifier,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'us54-hold-expiry' })
  async tick(): Promise<void> {
    // Separately, so one failing does not stop the other.
    for (const [name, job] of [
      ['expiry', () => this.expireDueHolds()],
      ['warning', () => this.sendExpiryWarnings()],
    ] as const) {
      try {
        await job();
      } catch (error) {
        this.logger.error(`hold ${name} job failed; it runs again next minute`, error as Error);
      }
    }
  }

  /** Release every hold whose expiry has passed; returns the ids released. */
  expireDueHolds(now: Date = new Date()): Promise<string[]> {
    return this.prisma.$transaction((tx) => releaseExpiredHolds(tx, this.notifier, {}, now));
  }

  /** Warn about holds expiring within 24 hours, once each; returns their ids. */
  sendExpiryWarnings(now: Date = new Date()): Promise<string[]> {
    return this.prisma.$transaction((tx) => sendHoldWarnings(tx, this.notifier, now));
  }
}
