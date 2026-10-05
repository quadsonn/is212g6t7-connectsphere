import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

/**
 * E7 — attendee registration (US-34), "My Registrations" (US-35) and
 * withdrawal (US-36).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [RegistrationsController],
  providers: [RegistrationsService],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
