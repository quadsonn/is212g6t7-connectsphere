import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { EquipmentNotifier } from './equipment-notifier';
import { EquipmentRequirementsService } from './equipment-requirements.service';
import { EquipmentReservationsService } from './equipment-reservations.service';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';

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
  controllers: [EquipmentController],
  providers: [
    EquipmentService,
    EquipmentRequirementsService,
    EquipmentReservationsService,
    EquipmentNotifier,
  ],
  exports: [EquipmentService, EquipmentReservationsService],
})
export class EquipmentModule {}
