import { NotFoundException } from '@nestjs/common';
import { Role, VenueStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { VenueBookingLookup } from '../bookings/booking-impact';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { VenuesService } from './venues.service';

/** US-49 — configuring a venue's setup and turnaround time. */
describe('VenuesService updateBuffers (US-49)', () => {
  let prisma: { venue: { update: jest.Mock; findUnique: jest.Mock } };
  let access: { requireScope: jest.Mock };
  let service: VenuesService;

  const manager: AuthenticatedUser = { userId: 'staff-1', role: Role.VENUE_STAFF, jti: 'j1' };
  const otherStaff: AuthenticatedUser = { userId: 'staff-2', role: Role.VENUE_STAFF, jti: 'j2' };

  const venue = (overrides: Record<string, unknown> = {}) => ({
    id: 'venue-1',
    name: 'Sandbox Auditorium',
    status: VenueStatus.PUBLISHED,
    managedById: 'staff-1',
    setupMinutes: 0,
    turnaroundMinutes: 0,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      venue: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(venue(data))),
        findUnique: jest.fn().mockResolvedValue(venue()),
      },
    };
    access = { requireScope: jest.fn().mockReturnValue(Scope.OWN) };

    service = new VenuesService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      {} as unknown as VenueBookingLookup,
      {} as unknown as NotificationsService,
      {} as unknown as SupabaseStorageService,
      {} as unknown as EventsService,
    );
  });

  it('US-49 AC-1/AC-5: the managing Venue Staff saves both values, and they are returned', async () => {
    const result = await service.updateBuffers(manager, 'venue-1', {
      setupMinutes: 30,
      turnaroundMinutes: 45,
    });

    expect(prisma.venue.update).toHaveBeenCalledWith({
      where: { id: 'venue-1' },
      data: { setupMinutes: 30, turnaroundMinutes: 45 },
    });
    expect(result).toMatchObject({ setupMinutes: 30, turnaroundMinutes: 45 });
  });

  it('US-49 AC-1: a draft venue can be configured too', async () => {
    prisma.venue.findUnique.mockResolvedValue(venue({ status: VenueStatus.DRAFT }));

    await service.updateBuffers(manager, 'venue-1', { setupMinutes: 15, turnaroundMinutes: 0 });

    expect(prisma.venue.update).toHaveBeenCalled();
  });

  it('US-49 AC-4: Venue Staff who do not manage the venue see it as not found, and nothing is saved', async () => {
    await expect(
      service.updateBuffers(otherStaff, 'venue-1', { setupMinutes: 30, turnaroundMinutes: 45 }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.venue.update).not.toHaveBeenCalled();
  });

  it('US-49: a missing venue is not found', async () => {
    prisma.venue.findUnique.mockResolvedValue(null);

    await expect(
      service.updateBuffers(manager, 'nope', { setupMinutes: 30, turnaroundMinutes: 45 }),
    ).rejects.toThrow(NotFoundException);
  });
});
