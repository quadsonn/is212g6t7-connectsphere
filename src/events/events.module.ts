import { Module } from '@nestjs/common';

import { EquipmentModule } from '../equipment/equipment.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsChangeRequestService } from './events-change-request.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * E2/E3 — event requests, drafts, review, status. E8 change requests live here.
 * US-02 adds the read paths; create/submit arrive with US-04.
 */
@Module({
  // EquipmentModule: US-33 releases an event's equipment on cancellation.
  imports: [NotificationsModule, EquipmentModule],
  controllers: [EventsController],
  providers: [EventsService, EventsChangeRequestService],
  exports: [EventsService],
})
export class EventsModule {}
