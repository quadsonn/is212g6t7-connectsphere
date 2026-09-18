import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * E2/E3 — event requests, drafts, review, status. E8 change requests live here.
 * US-02 adds the read paths; create/submit arrive with US-04.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
