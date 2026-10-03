import { ForbiddenException } from '@nestjs/common';
import { Role, VenueStatus } from '@prisma/client';

import { VenueBookingLookup } from '../bookings/booking-impact';
import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { SortOrder, VenueSortField } from './dto/browse-venues.dto';
import { VenuesService } from './venues.service';

/** US-15 — browsing the catalogue. */
describe('VenuesService browse (US-15)', () => {
  let prisma: { venue: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock } };
  let access: { requireScope: jest.Mock };
  let service: VenuesService;

  const coordinator: AuthenticatedUser = {
    userId: 'coord-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'j1',
  };

  const lastCall = () => prisma.venue.findMany.mock.calls[0][0];

  beforeEach(() => {
    prisma = {
      venue: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    access = { requireScope: jest.fn().mockReturnValue(Scope.ANY) };

    service = new VenuesService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      { findLiveBookingsForVenue: jest.fn() } as unknown as VenueBookingLookup,
      { notify: jest.fn(), notifySafely: jest.fn() } as unknown as NotificationsService,
      {} as unknown as SupabaseStorageService,
    );
  });

  describe('AC-1: the list is scoped and ordered sensibly', () => {
    it('applies the US-13 visibility rule', async () => {
      await service.findAllForUser(coordinator);

      expect(lastCall().where).toEqual(service.visibilityFilter(coordinator));
    });

    it('excludes other people’s drafts by construction', async () => {
      await service.findAllForUser(coordinator);

      // The only DRAFT branch is the caller's own.
      expect(JSON.stringify(lastCall().where)).toMatch(
        /"managedById":"coord-1"/,
      );
    });

    it('defaults to name ascending', async () => {
      await service.findAllForUser(coordinator);

      expect(lastCall().orderBy).toEqual([
        { status: 'asc' },
        { name: { sort: 'asc', nulls: 'last' } },
      ]);
    });

    it('refuses a role with no venue read grant', async () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(service.findAllForUser(coordinator)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('AC-3: finding one venue without scrolling', () => {
    it('filters by a case-insensitive name substring', async () => {
      await service.findAllForUser(coordinator, { search: 'audit' });

      expect(lastCall().where).toEqual({
        AND: [
          service.visibilityFilter(coordinator),
          { name: { contains: 'audit', mode: 'insensitive' } },
        ],
      });
    });

    it('keeps the visibility rule alongside the search', async () => {
      await service.findAllForUser(coordinator, { search: 'audit' });

      // A search must never widen what the caller may see.
      expect(JSON.stringify(lastCall().where)).toMatch(/PUBLISHED/);
    });

    it('ignores an absent search rather than matching nothing', async () => {
      await service.findAllForUser(coordinator, {});

      expect(lastCall().where).toEqual(service.visibilityFilter(coordinator));
    });

    it.each([
      [VenueSortField.NAME],
      [VenueSortField.CAPACITY],
      [VenueSortField.LOCATION],
    ])('sorts by %s', async (sortBy) => {
      await service.findAllForUser(coordinator, { sortBy });

      expect(lastCall().orderBy[1]).toEqual({
        [sortBy]: { sort: 'asc', nulls: 'last' },
      });
    });

    it('sorts descending when asked', async () => {
      await service.findAllForUser(coordinator, {
        sortBy: VenueSortField.CAPACITY,
        sortOrder: SortOrder.DESC,
      });

      expect(lastCall().orderBy[1]).toEqual({
        capacity: { sort: 'desc', nulls: 'last' },
      });
    });

    it('puts incomplete drafts last rather than at the top', async () => {
      await service.findAllForUser(coordinator, { sortBy: VenueSortField.NAME });

      expect(lastCall().orderBy[1].name.nulls).toBe('last');
    });

    it('groups drafts before published entries', async () => {
      await service.findAllForUser(coordinator);

      expect(lastCall().orderBy[0]).toEqual({ status: 'asc' });
      expect(VenueStatus.DRAFT < VenueStatus.PUBLISHED).toBe(true);
    });
  });

  describe('AC-4: no stale data', () => {
    it('queries the database on every call', async () => {
      await service.findAllForUser(coordinator);
      await service.findAllForUser(coordinator);
      await service.findAllForUser(coordinator);

      expect(prisma.venue.findMany).toHaveBeenCalledTimes(3);
    });

    it('holds no memoised result between different queries', async () => {
      await service.findAllForUser(coordinator, { search: 'a' });
      await service.findAllForUser(coordinator, { search: 'b' });

      expect(prisma.venue.findMany.mock.calls[0][0].where).not.toEqual(
        prisma.venue.findMany.mock.calls[1][0].where,
      );
    });
  });
});
