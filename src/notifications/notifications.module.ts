import { Module } from '@nestjs/common';

import { NotificationsService } from './notifications.service';

/**
 * E9 — notification records for significant events.
 *
 * Only the recording half exists (see NotificationsService); delivery is still
 * to be built. Exported so domain modules can raise notifications without
 * waiting for the full story.
 */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
