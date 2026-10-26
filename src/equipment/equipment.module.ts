import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { EquipmentNotifier } from './equipment-notifier';
import { EquipmentRequirementsService } from './equipment-requirements.service';
import { EquipmentReservationsService } from './equipment-reservations.service';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';
import { EquipmentStatusNotifier } from './equipment-status-notifier';
import { TechnicalSupportNotifier } from './technical-support-notifier';
import { TechnicalSupportAssignmentsController } from './technical-support-assignments.controller';
import { TechnicalSupportAssignmentsService } from './technical-support-assignments.service';

/**
 * E6 — equipment: catalogue (US-29), availability (US-30), event requirements
 * (US-31), commitment (US-32), release on cancellation (US-33) and
 * operational status changes (US-45).
 *
 * Exports EquipmentReservationsService so EventsService can release an
 * event's equipment when it is cancelled. This module must not import
 * EventsModule in return — that would be a cycle.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [EquipmentController, TechnicalSupportAssignmentsController],
  providers: [
    EquipmentService,
    EquipmentRequirementsService,
    EquipmentReservationsService,
    // US-61 AC-3: a Technical Support member's assignment list.
    TechnicalSupportAssignmentsService,
    // US-60: tells Technical Support when an item is taken out of use.
    EquipmentStatusNotifier,
    // US-66: tells an event's assigned Technical Support member.
    TechnicalSupportNotifier,
    EquipmentNotifier,
  ],
  // US-66: TechnicalSupportNotifier, so EventsService can tell Technical
  // Support when an event's requirements change.
  exports: [EquipmentService, EquipmentReservationsService, TechnicalSupportNotifier],
})
export class EquipmentModule {}
