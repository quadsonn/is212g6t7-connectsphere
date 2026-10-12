import { Module } from '@nestjs/common';

import { BookingsModule } from '../bookings/bookings.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsAssignmentController } from './events-assignment.controller';
import { EventsAssignmentService } from './events-assignment.service';
import { EventsChangeRequestService } from './events-change-request.service';
import { EventsChangeReviewService } from './events-change-review.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * E2/E3 — event requests, drafts, review, status. E8 change requests live here.
 * US-02 adds the read paths; create/submit arrive with US-04.
 */
@Module({
  // EquipmentModule: US-33 releases an event's equipment on cancellation.
  // BookingsModule: US-38 moves an event's bookings when its dates change.
  imports: [NotificationsModule, EquipmentModule, BookingsModule],
  controllers: [EventsController, EventsAssignmentController],
  providers: [
    EventsService,
    EventsAssignmentService,
    EventsChangeRequestService,
    EventsChangeReviewService,
  ],
  exports: [EventsService],
})
export class EventsModule {}
