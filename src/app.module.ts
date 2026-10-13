import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccessModule } from './common/access/access.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { VenuesModule } from './venues/venues.module';
import { BookingsModule } from './bookings/bookings.module';
import { EquipmentModule } from './equipment/equipment.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ArrangementsModule } from './common/arrangements/arrangements.module';
import { SafetyModule } from './safety/safety.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccessModule,
    ArrangementsModule,
    AuthModule,
    UsersModule,
    EventsModule,
    VenuesModule,
    BookingsModule,
    EquipmentModule,
    RegistrationsModule,
    NotificationsModule,
    SafetyModule,
  ],
})
export class AppModule {}
