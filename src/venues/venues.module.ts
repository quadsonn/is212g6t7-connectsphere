import { Module } from '@nestjs/common';

import { BookingsModule } from '../bookings/bookings.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';

/**
 * E4 — catalogue, availability, search/filter, suitability.
 * US-13 adds the catalogue and its draft/publish lifecycle.
 */
@Module({
  imports: [BookingsModule, EquipmentModule, EventsModule, NotificationsModule],
  controllers: [VenuesController],
  providers: [VenuesService, SupabaseStorageService],
  exports: [VenuesService],
})
export class VenuesModule {}
