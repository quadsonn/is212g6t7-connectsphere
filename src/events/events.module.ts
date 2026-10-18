import { Module } from '@nestjs/common';

import { BookingsModule } from '../bookings/bookings.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsChangeRequestService } from './events-change-request.service';
import { EventsChangeReviewService } from './events-change-review.service';
import { EventsController } from './events.controller';
import { ChangeArrangementCheckService } from './change-arrangement-check.service';
import { EventsService } from './events.service';
import { EventsUnfulfillableService } from './events-unfulfillable.service';

/**
 * E2/E3 — event requests, drafts, review, status. E8 change requests live here.
 * US-02 adds the read paths; create/submit arrive with US-04.
 */
@Module({
  // EquipmentModule: US-33 releases an event's equipment on cancellation.
  // BookingsModule: US-38 moves an event's bookings when its dates change.
  imports: [NotificationsModule, EquipmentModule, BookingsModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventsChangeRequestService,
    EventsChangeReviewService,
    // US-47: reject an approved request that cannot be fulfilled.
    EventsUnfulfillableService,
    // US-48: check a change request against the event's arrangements.
    ChangeArrangementCheckService,
  ],
  exports: [EventsService],
})
export class EventsModule {}
