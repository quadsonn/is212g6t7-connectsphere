import { Module } from '@nestjs/common';

import { NotificationsInboxService } from './notifications-inbox.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * E9 — notification records for significant events.
 *
 * Recording (NotificationsService) plus the in-app inbox: a user reads and
 * marks their own notifications (NotificationsInboxService). Email and push
 * delivery are not built. Exported so domain modules can raise notifications without
 * waiting for the full story.
 */
@Module({
  // Notifications page: reading and marking one's own notifications.
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsInboxService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
