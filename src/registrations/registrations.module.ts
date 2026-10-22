import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { RegistrationNotificationsService } from './registration-notifications.service';
import { RegistrationNotificationsScheduler } from './registration-notifications.scheduler';

/**
 * E7 — attendee registration (US-34), "My Registrations" (US-35), withdrawal
 * (US-36), and the registration-window notices (opens / closes / near
 * capacity), swept once a minute by RegistrationNotificationsScheduler.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [RegistrationsController],
  providers: [
    RegistrationsService,
    RegistrationNotificationsService,
    RegistrationNotificationsScheduler,
  ],
  exports: [RegistrationsService, RegistrationNotificationsService],
})
export class RegistrationsModule {}
