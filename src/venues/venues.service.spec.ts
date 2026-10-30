import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, RoomLayout, VenueStatus } from '@prisma/client';

import { VenueBookingLookup } from '../bookings/booking-impact';
import { AccessControlService } from '../common/access/access-control.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Action, Resource, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BookingReviewService } from '../bookings/booking-review.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { VenueDraftDto } from './dto/venue-draft.dto';
import { VenuesService } from './venues.service';
import { EquipmentService } from '../equipment/equipment.service';

/**
 * Unit tests for US-13 (Add a new venue with its key characteristics):
 * VenuesService's draft, publish and visibility rules, with Prisma, access
 * control and the booking lookup mocked. The same rules over HTTP and the test
 * database are in test/venues.e2e-spec.ts.
 */
describe('VenuesService (US-13)', () => {
  let prisma: {
    venue: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let access: { requireScope: jest.Mock };
  let bookings: { findLiveBookingsForVenue: jest.Mock };
  let notifications: { notify: jest.Mock; notifySafely: jest.Mock };
  let service: VenuesService;

  const staff: AuthenticatedUser = {
    userId: 'staff-1',
    role: Role.VENUE_STAFF,
    jti: 'j1',
  };
  const coordinator: AuthenticatedUser = {
    userId: 'coord-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'j2',
  };

  const venue = (overrides: Record<string, unknown> = {}) => ({
    id: 'venue-1',
    name: 'Sandbox Auditorium',
    location: 'School of Computing, Level 1',
    capacity: 420,
    facilities: [],
    accessibilityFeatures: [],
    supportedLayouts: [],
    operatingInfo: null,
    status: VenueStatus.DRAFT,
    managedById: 'staff-1',
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      venue: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(venue(data)),
        ),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(venue(data)),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(venue()),
        findUnique: jest.fn().mockResolvedValue(venue()),
      },
    };
    access = { requireScope: jest.fn().mockReturnValue(Scope.OWN) };
    // US-14 added the booking-impact check; a venue with no live bookings is
    // the neutral case for US-13's tests.
    bookings = { findLiveBookingsForVenue: jest.fn().mockResolvedValue([]) };
    notifications = { notify: jest.fn(), notifySafely: jest.fn() };

    service = new VenuesService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      bookings as unknown as VenueBookingLookup,
      notifications as unknown as NotificationsService,
      { uploadVenueImage: jest.fn() } as unknown as SupabaseStorageService,
      {} as unknown as EventsService,
      {} as unknown as BookingReviewService,
      {} as unknown as EquipmentService,
    );
  });

  // TC-S1-96 · US-13 AC-1 · unit: saveDraft() with Prisma mocked · fails if a detail the AC names is
  // dropped, or layouts stop using the shared US-06 list
  describe('AC-1: the full set of venue details', () => {
    it('accepts every detail field', async () => {
      await service.saveDraft(staff, {
        name: 'Campus Green',
        location: 'Outdoor, adjacent to Library',
        capacity: 800,
        facilities: ['POWER_OUTLETS'],
        facilityNotes: 'Marquee points',
        accessibilityFeatures: ['STEP_FREE_ACCESS', 'ACCESSIBLE_RESTROOMS'],
        accessibilityNotes: 'Braille signage at entrances',
        supportedLayouts: [RoomLayout.BANQUET, RoomLayout.THEATRE],
        operatingInfo: 'Daily, subject to weather',
      } as VenueDraftDto);

      expect(prisma.venue.create.mock.calls[0][0].data).toMatchObject({
        name: 'Campus Green',
        location: 'Outdoor, adjacent to Library',
        capacity: 800,
        facilities: ['POWER_OUTLETS'],
        // US-18: what the vocabulary does not cover survives as notes.
        facilityNotes: 'Marquee points',
        accessibilityNotes: 'Braille signage at entrances',
        supportedLayouts: [RoomLayout.BANQUET, RoomLayout.THEATRE],
        operatingInfo: 'Daily, subject to weather',
      });
    });

    it('uses the shared US-06 layout vocabulary', async () => {
      await service.saveDraft(staff, {
        supportedLayouts: [RoomLayout.BOARDROOM],
      } as VenueDraftDto);

      // Same values an event request uses for preferredLayout.
      expect(prisma.venue.create.mock.calls[0][0].data.supportedLayouts).toEqual([
        'BOARDROOM',
      ]);
    });
  });

  // TC-S1-97 · US-13 AC-2 · unit: saveDraft()/updateDraft() with Prisma and access mocked · fails if
  // an empty or partial venue is refused, or an edit overwrites fields it did not send
  describe('AC-2: an incomplete venue saves as a draft', () => {
    it('saves with no fields at all', async () => {
      const result = await service.saveDraft(staff, {} as VenueDraftDto);

      expect(result.status).toBe(VenueStatus.DRAFT);
      expect(prisma.venue.create).toHaveBeenCalled();
    });

    it('never writes status on create — DRAFT is the schema default', async () => {
      await service.saveDraft(staff, {} as VenueDraftDto);

      expect(prisma.venue.create.mock.calls[0][0].data).not.toHaveProperty('status');
    });

    it('records the creator as the managing staff member', async () => {
      await service.saveDraft(staff, {} as VenueDraftDto);

      expect(prisma.venue.create.mock.calls[0][0].data.managedById).toBe('staff-1');
    });

    it('checks the CREATE grant before writing', async () => {
      await service.saveDraft(staff, {} as VenueDraftDto);

      expect(access.requireScope).toHaveBeenCalledWith(
        staff,
        Resource.VENUE,
        Action.CREATE,
      );
    });

    it('writes only the fields supplied on an edit', async () => {
      await service.updateDraft(staff, 'venue-1', {
        capacity: 500,
      } as VenueDraftDto);

      expect(prisma.venue.update.mock.calls[0][0].data).toEqual({ capacity: 500 });
    });
  });

  // TC-S1-98 · US-13 AC-3 · unit: publish() with Prisma mocked · fails if an incomplete venue
  // publishes, or the refusal does not name every missing field
  describe('AC-3: publishing is blocked until complete', () => {
    it('publishes a complete draft', async () => {
      const result = await service.publish(staff, 'venue-1');

      expect(result.status).toBe(VenueStatus.PUBLISHED);
    });

    it('blocks a draft with no name', async () => {
      prisma.venue.findUnique.mockResolvedValue(venue({ name: null }));

      await expect(service.publish(staff, 'venue-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.venue.update).not.toHaveBeenCalled();
    });

    it('blocks a draft with no capacity', async () => {
      prisma.venue.findUnique.mockResolvedValue(venue({ capacity: null }));

      await expect(service.publish(staff, 'venue-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('names every missing field at once', async () => {
      prisma.venue.findUnique.mockResolvedValue(
        venue({ name: null, location: null, capacity: null }),
      );

      const error = await service
        .publish(staff, 'venue-1')
        .catch((e: BadRequestException) => e);

      const messages = (
        (error as BadRequestException).getResponse() as { message: string[] }
      ).message.join(' | ');

      expect(messages).toMatch(/name is required/);
      expect(messages).toMatch(/location is required/);
      expect(messages).toMatch(/capacity is required/);
    });

    it('does not require facilities, layouts or operating hours', async () => {
      prisma.venue.findUnique.mockResolvedValue(
        venue({ facilities: [], supportedLayouts: [], operatingInfo: null }),
      );

      await expect(service.publish(staff, 'venue-1')).resolves.toMatchObject({
        status: VenueStatus.PUBLISHED,
      });
    });

    it('is idempotent for an already published venue', async () => {
      prisma.venue.findUnique.mockResolvedValue(
        venue({ status: VenueStatus.PUBLISHED }),
      );

      const result = await service.publish(staff, 'venue-1');

      expect(result.status).toBe(VenueStatus.PUBLISHED);
      expect(prisma.venue.update).not.toHaveBeenCalled();
    });

    it('checks the PUBLISH grant, not UPDATE', async () => {
      await service.publish(staff, 'venue-1');

      expect(access.requireScope).toHaveBeenCalledWith(
        staff,
        Resource.VENUE,
        Action.PUBLISH,
      );
    });
  });

  // TC-S1-99 · US-13 AC-4 · unit: visibilityFilter() and findAllForUser() · fails if the filter
  // admits someone else's draft, or is applied after loading rather than in the query
  describe('AC-4: drafts are visible only to their manager', () => {
    it('builds a filter admitting published entries and own drafts', () => {
      expect(service.visibilityFilter(staff)).toEqual({
        OR: [
          { status: VenueStatus.PUBLISHED },
          { status: VenueStatus.DRAFT, managedById: 'staff-1' },
        ],
      });
    });

    it('scopes a Coordinator to published entries plus their own (of which there are none)', () => {
      expect(service.visibilityFilter(coordinator)).toEqual({
        OR: [
          { status: VenueStatus.PUBLISHED },
          { status: VenueStatus.DRAFT, managedById: 'coord-1' },
        ],
      });
    });

    it('applies the filter to the list query rather than filtering after', async () => {
      await service.findAllForUser(staff);

      expect(prisma.venue.findMany.mock.calls[0][0].where).toEqual(
        service.visibilityFilter(staff),
      );
    });

    it('refuses a role with no venue read grant', () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      expect(() => service.visibilityFilter(staff)).toThrow(ForbiddenException);
    });

    it('reports an invisible venue as not found', async () => {
      prisma.venue.findFirst.mockResolvedValue(null);

      await expect(service.findOneForUser(coordinator, 'venue-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // TC-S1-99 · US-13 AC-4 · unit: findManaged() · fails if a Venue Staff member can edit or publish
  // a venue they do not manage
  describe('managing another staff member’s venue', () => {
    it('refuses to edit it, as not found', async () => {
      prisma.venue.findUnique.mockResolvedValue(venue({ managedById: 'staff-2' }));

      await expect(
        service.updateDraft(staff, 'venue-1', { capacity: 1 } as VenueDraftDto),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.venue.update).not.toHaveBeenCalled();
    });

    it('refuses to publish it', async () => {
      prisma.venue.findUnique.mockResolvedValue(venue({ managedById: 'staff-2' }));

      await expect(service.publish(staff, 'venue-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a venue that does not exist', async () => {
      prisma.venue.findUnique.mockResolvedValue(null);

      await expect(service.publish(staff, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
