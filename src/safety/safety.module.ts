import { Module } from '@nestjs/common';

import { BookingsModule } from '../bookings/bookings.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SafetyController } from './safety.controller';
import { SafetyReadinessService } from './safety-readiness.service';
import { SafetyService } from './safety.service';

/**
 * Requirement change 6 — the operational safety check.
 *
 * Depends on events and bookings; neither depends on it. They (and equipment)
 * reach it only through the global ArrangementsRegistry, which this module's
 * SafetyReadinessService registers with at start-up.
 */
@Module({
  imports: [EventsModule, BookingsModule, NotificationsModule],
  controllers: [SafetyController],
  providers: [SafetyService, SafetyReadinessService],
  exports: [SafetyService],
})
export class SafetyModule {}
