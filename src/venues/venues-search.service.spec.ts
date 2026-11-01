import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookingStatus, Role, VenueStatus } from '@prisma/client';

import { VenueBookingLookup } from '../bookings/booking-impact';
import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingReviewService } from '../bookings/booking-review.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { VenueSearchDto } from './dto/venue-search.dto';
import { VenuesService } from './venues.service';
import { EquipmentService } from '../equipment/equipment.service';

/**
 * US-18 — how a search becomes a query. With Prisma mocked, these pin the
 * filter the service builds; test/venues-search.e2e-spec.ts proves Postgres
 * returns the right venues for it.
 */
// TC-S2-18 to TC-S2-24 · US-18 AC-1 to AC-5 · unit: search() with Prisma mocked · fails if a filter
// is dropped, OR-ed, or a draft can be returned
describe('US-18 VenuesService.search', () => {
  let prisma: {
    venue: { findMany: jest.Mock };
    venueBooking: { findMany: jest.Mock };
    venueBlock: { findMany: jest.Mock };
  };
  let access: { requireScope: jest.Mock };
  let service: VenuesService;

  const coordinator: AuthenticatedUser = {
    userId: 'coord-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'j1',
  };

  const where = () => prisma.venue.findMany.mock.calls[0][0].where;

  beforeEach(() => {
    prisma = {
      venue: { findMany: jest.fn().mockResolvedValue([]) },
      // US-50: the date filter's bookings, read by the shared check.
      venueBooking: { findMany: jest.fn().mockResolvedValue([]) },
      venueBlock: { findMany: jest.fn().mockResolvedValue([]) },
    };
    access = { requireScope: jest.fn().mockReturnValue(Scope.PUBLIC) };

    service = new VenuesService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      {} as unknown as VenueBookingLookup,
      {} as unknown as NotificationsService,
      {} as unknown as SupabaseStorageService,
      {} as unknown as EventsService,
      {} as unknown as BookingReviewService,
      {} as unknown as EquipmentService,
    );
  });

  it('US-18: requires the availability grant, not plain VENUE/READ', async () => {
    await service.search(coordinator, {});

    expect(access.requireScope).toHaveBeenCalledWith(
      coordinator,
      Resource.VENUE,
      Action.CHECK_AVAILABILITY,
    );
  });

  it('US-18: refuses a caller without the grant', async () => {
    access.requireScope.mockImplementation(() => {
      throw new ForbiddenException();
    });

    await expect(service.search(coordinator, {})).rejects.toThrow(ForbiddenException);
    expect(prisma.venue.findMany).not.toHaveBeenCalled();
  });

  it('US-18: an empty search filters on publication only', async () => {
    await service.search(coordinator, {});

    expect(where()).toEqual({ status: VenueStatus.PUBLISHED });
  });

  it('US-15 AC-3 (restored after US-18): matches the name case-insensitively', async () => {
    await service.search(coordinator, { name: 'audit' });

    expect(where().name).toEqual({ contains: 'audit', mode: 'insensitive' });
  });

  it('US-18 AC-2: minimum capacity is inclusive (gte)', async () => {
    await service.search(coordinator, { minCapacity: 100 });

    expect(where().capacity).toEqual({ gte: 100 });
  });

  it('US-18 AC-3/AC-4: accessibility and facilities require every value (hasEvery)', async () => {
    await service.search(coordinator, {
      accessibility: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
      facilities: ['PROJECTOR', 'WIFI'],
    });

    expect(where().accessibilityFeatures).toEqual({
      hasEvery: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
    });
    expect(where().facilities).toEqual({ hasEvery: ['PROJECTOR', 'WIFI'] });
  });

  it('US-18: an empty list places no constraint', async () => {
    await service.search(coordinator, { accessibility: [], facilities: [] });

    expect(where()).toEqual({ status: VenueStatus.PUBLISHED });
  });

  it('US-18 AC-1 / US-54 AC-3: excludes venues with an APPROVED booking or a live hold overlapping the slot', async () => {
    // US-50: the date filter is the shared, buffer-aware check over the
    // venues the other filters matched — no longer part of the same query.
    prisma.venue.findMany.mockResolvedValue([
      { id: 'busy', setupMinutes: 0, turnaroundMinutes: 0 },
      { id: 'free', setupMinutes: 0, turnaroundMinutes: 0 },
    ]);
    prisma.venueBooking.findMany.mockResolvedValue([
      {
        venueId: 'busy',
        start: new Date('2027-03-10T02:00:00Z'),
        end: new Date('2027-03-10T03:00:00Z'),
      },
    ]);

    const result = await service.search(coordinator, {
      from: '2027-03-10T01:00:00Z',
      to: '2027-03-10T09:00:00Z',
    });

    expect(result.map((v) => v.id)).toEqual(['free']);
    expect(prisma.venueBooking.findMany).toHaveBeenCalledWith({
      where: {
        venueId: { in: ['busy', 'free'] },
        // US-54 AC-3: a live tentative hold blocks like a confirmed booking.
        OR: [
          { status: BookingStatus.APPROVED },
          { status: BookingStatus.HELD, holdExpiresAt: { gt: expect.any(Date) } },
        ],
        start: { lt: new Date('2027-03-10T09:00:00Z') },
        end: { gt: new Date('2027-03-10T01:00:00Z') },
      },
      select: { venueId: true, start: true, end: true },
    });
    expect(prisma.venue.findMany).toHaveBeenCalledTimes(1);
  });

  it('US-18 AC-5: combines every active filter in one where clause', async () => {
    await service.search(coordinator, {
      from: '2027-03-10T01:00:00Z',
      to: '2027-03-10T09:00:00Z',
      minCapacity: 50,
      accessibility: ['STEP_FREE_ACCESS'],
      facilities: ['STAGE'],
    });

    // US-50: the date is applied afterwards by the shared buffer-aware check.
    expect(Object.keys(where()).sort()).toEqual([
      'accessibilityFeatures',
      'capacity',
      'facilities',
      'status',
    ]);
    expect(where().status).toBe(VenueStatus.PUBLISHED);
  });

  it.each([[{ from: '2027-03-10T01:00:00Z' }], [{ to: '2027-03-10T09:00:00Z' }]])(
    'US-18 AC-1: rejects half a date range %j',
    async (query) => {
      await expect(service.search(coordinator, query)).rejects.toThrow(BadRequestException);
    },
  );

  it('US-18 AC-6: returns an empty array when nothing matches', async () => {
    await expect(service.search(coordinator, { minCapacity: 99999 })).resolves.toEqual([]);
  });

  // TC-S2-19 to TC-S2-22 · US-18 AC-1 to AC-4 · unit: VenueSearchDto validation · fails if a bad
  // range, capacity or vocabulary value is accepted
  describe('VenueSearchDto', () => {
    const parse = async (query: Record<string, unknown>) => {
      const dto = plainToInstance(VenueSearchDto, query);
      return { dto, errors: await validate(dto) };
    };

    it('US-18: reads a comma-separated list', async () => {
      const { dto, errors } = await parse({ facilities: 'PROJECTOR,WIFI' });

      expect(errors).toHaveLength(0);
      expect(dto.facilities).toEqual(['PROJECTOR', 'WIFI']);
    });

    it('US-18: reads a repeated key', async () => {
      const { dto, errors } = await parse({ accessibility: ['STEP_FREE_ACCESS', 'HEARING_LOOP'] });

      expect(errors).toHaveLength(0);
      expect(dto.accessibility).toEqual(['STEP_FREE_ACCESS', 'HEARING_LOOP']);
    });

    it('US-15 AC-3 (restored after US-18): treats a blank name as no filter', async () => {
      const { dto, errors } = await parse({ name: '   ' });

      expect(errors).toHaveLength(0);
      expect(dto.name).toBeUndefined();
    });

    it('US-18: coerces minCapacity from the query string', async () => {
      const { dto, errors } = await parse({ minCapacity: '120' });

      expect(errors).toHaveLength(0);
      expect(dto.minCapacity).toBe(120);
    });

    it.each([
      [{ facilities: 'Projector' }, 'facilities'],
      [{ accessibility: 'ramp' }, 'accessibility'],
      [{ minCapacity: '0' }, 'minCapacity'],
      [{ minCapacity: 'lots' }, 'minCapacity'],
      [{ from: '10 March' }, 'from'],
      [{ from: '2027-03-10T09:00:00Z', to: '2027-03-10T08:00:00Z' }, 'to'],
    ])('US-18: rejects %j', async (query, field) => {
      const { errors } = await parse(query);

      expect(errors.map((e) => e.property)).toContain(field);
    });
  });
});
