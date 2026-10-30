import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingStatus, NotificationType, Role, RoomLayout, VenueStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { VenueBookingLookup } from '../bookings/booking-impact';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingReviewService } from '../bookings/booking-review.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { VenueDraftDto } from './dto/venue-draft.dto';
import { VenuesService } from './venues.service';
import { EquipmentService } from '../equipment/equipment.service';

/**
 * Unit tests for US-14 (Update a venue's details as facilities change):
 * VenuesService.updateDraft() and its booking-impact warning, with Prisma, the
 * booking lookup and notifications mocked. Over HTTP and the test database:
 * test/venues-update.e2e-spec.ts.
 */
describe('VenuesService update (US-14)', () => {
  let prisma: { venue: { update: jest.Mock; findUnique: jest.Mock; create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock } };
  let access: { requireScope: jest.Mock };
  let bookings: { findLiveBookingsForVenue: jest.Mock };
  let notifications: { notify: jest.Mock; notifySafely: jest.Mock };
  let service: VenuesService;

  const staff: AuthenticatedUser = {
    userId: 'staff-1',
    role: Role.VENUE_STAFF,
    jti: 'j1',
  };

  const venue = (overrides: Record<string, unknown> = {}) => ({
    id: 'venue-1',
    name: 'Sandbox Auditorium',
    location: 'School of Computing, Level 1',
    capacity: 420,
    facilities: ['STAGE'],
    accessibilityFeatures: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
    supportedLayouts: [RoomLayout.THEATRE, RoomLayout.CLASSROOM],
    operatingInfo: 'Mon-Fri',
    status: VenueStatus.PUBLISHED,
    managedById: 'staff-1',
    ...overrides,
  });

  const aBooking = () => ({
    bookingId: 'booking-1',
    eventId: 'event-1',
    start: new Date('2030-10-01T09:00:00Z'),
    end: new Date('2030-10-01T17:00:00Z'),
    status: BookingStatus.APPROVED,
  });

  beforeEach(() => {
    prisma = {
      venue: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(venue(data))),
        findUnique: jest.fn().mockResolvedValue(venue()),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(venue()),
      },
    };
    access = { requireScope: jest.fn().mockReturnValue(Scope.OWN) };
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

  // TC-S1-103 · US-14 AC-1 · unit: updateDraft() with Prisma mocked · fails if a detail cannot be
  // edited, or untouched fields change
  describe('AC-1: any detail can be edited', () => {
    it.each([
      ['capacity', { capacity: 500 }],
      ['facilities', { facilities: ['STAGE', 'SOUND_SYSTEM'] }],
      ['accessibility', { accessibilityFeatures: ['STEP_FREE_ACCESS', 'HEARING_LOOP', 'ACCESSIBLE_RESTROOMS'] }],
      ['layouts', { supportedLayouts: [RoomLayout.THEATRE, RoomLayout.CLASSROOM, RoomLayout.BANQUET] }],
      ['operating hours', { operatingInfo: 'Mon-Sun, 07:00-23:00' }],
    ])('edits %s', async (_label, patch) => {
      await service.updateDraft(staff, 'venue-1', patch as VenueDraftDto);

      expect(prisma.venue.update.mock.calls[0][0].data).toEqual(patch);
    });

    it('leaves untouched fields alone', async () => {
      await service.updateDraft(staff, 'venue-1', {
        capacity: 500,
      } as VenueDraftDto);

      expect(prisma.venue.update.mock.calls[0][0].data).not.toHaveProperty('name');
    });
  });

  // TC-S1-104 · US-14 AC-2 · unit: updateDraft() · fails if the saved record is not returned, or a
  // harmless edit carries a warning
  describe('AC-2: the change persists', () => {
    it('returns the updated record', async () => {
      const result = await service.updateDraft(staff, 'venue-1', {
        capacity: 500,
      } as VenueDraftDto);

      expect(result.capacity).toBe(500);
    });

    it('reports no warnings when nothing is at risk', async () => {
      const result = await service.updateDraft(staff, 'venue-1', {
        operatingInfo: 'Mon-Sun',
      } as VenueDraftDto);

      expect(result.warnings).toEqual([]);
    });
  });

  // TC-S1-105 · US-14 AC-3 · unit: assessBookingImpact() with the booking lookup and notifications
  // mocked · fails if a suitability-affecting change under live bookings gives no warning or
  // notification, or a harmless one does
  describe('AC-3: bookings that may need review', () => {
    it('warns when capacity is reduced and bookings exist', async () => {
      bookings.findLiveBookingsForVenue.mockResolvedValue([aBooking()]);

      const result = await service.updateDraft(staff, 'venue-1', {
        capacity: 100,
      } as VenueDraftDto);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('BOOKINGS_MAY_NEED_REVIEW');
      expect(result.warnings[0].reasons[0]).toMatch(/capacity reduced from 420 to 100/);
      expect(result.warnings[0].affectedBookingIds).toEqual(['booking-1']);
    });

    it('warns when a supported layout is withdrawn', async () => {
      bookings.findLiveBookingsForVenue.mockResolvedValue([aBooking()]);

      const result = await service.updateDraft(staff, 'venue-1', {
        supportedLayouts: [RoomLayout.THEATRE],
      } as VenueDraftDto);

      expect(result.warnings[0].reasons.join(' ')).toMatch(/CLASSROOM/);
    });

    it('warns when an accessibility feature is removed', async () => {
      bookings.findLiveBookingsForVenue.mockResolvedValue([aBooking()]);

      const result = await service.updateDraft(staff, 'venue-1', {
        accessibilityFeatures: ['STEP_FREE_ACCESS'],
      } as VenueDraftDto);

      expect(result.warnings[0].reasons.join(' ')).toMatch(/HEARING_LOOP/);
    });

    it('warns when the venue is relocated', async () => {
      bookings.findLiveBookingsForVenue.mockResolvedValue([aBooking()]);

      const result = await service.updateDraft(staff, 'venue-1', {
        location: 'Somewhere else entirely',
      } as VenueDraftDto);

      expect(result.warnings[0].reasons.join(' ')).toMatch(/location changed/);
    });

    it('does not warn when capacity increases', async () => {
      bookings.findLiveBookingsForVenue.mockResolvedValue([aBooking()]);

      const result = await service.updateDraft(staff, 'venue-1', {
        capacity: 900,
      } as VenueDraftDto);

      expect(result.warnings).toEqual([]);
    });

    it('does not warn when a layout or feature is added', async () => {
      bookings.findLiveBookingsForVenue.mockResolvedValue([aBooking()]);

      const result = await service.updateDraft(staff, 'venue-1', {
        supportedLayouts: [RoomLayout.THEATRE, RoomLayout.CLASSROOM, RoomLayout.BANQUET],
      } as VenueDraftDto);

      expect(result.warnings).toEqual([]);
    });

    it('does not warn when there are no live bookings', async () => {
      bookings.findLiveBookingsForVenue.mockResolvedValue([]);

      const result = await service.updateDraft(staff, 'venue-1', {
        capacity: 10,
      } as VenueDraftDto);

      expect(result.warnings).toEqual([]);
    });

    it('does not even look for bookings when nothing degraded', async () => {
      await service.updateDraft(staff, 'venue-1', {
        operatingInfo: 'Mon-Sun',
      } as VenueDraftDto);

      expect(bookings.findLiveBookingsForVenue).not.toHaveBeenCalled();
    });

    it('records a durable notification for the staff member', async () => {
      bookings.findLiveBookingsForVenue.mockResolvedValue([aBooking()]);

      await service.updateDraft(staff, 'venue-1', { capacity: 10 } as VenueDraftDto);

      expect(notifications.notifySafely).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'staff-1',
          type: NotificationType.VENUE_CHANGED_BOOKINGS_AFFECTED,
        }),
      );
    });

    it('still applies the change — a warning is not a rejection', async () => {
      bookings.findLiveBookingsForVenue.mockResolvedValue([aBooking()]);

      await service.updateDraft(staff, 'venue-1', { capacity: 10 } as VenueDraftDto);

      expect(prisma.venue.update).toHaveBeenCalled();
    });

    it('compares against the record as it was, not as it becomes', async () => {
      bookings.findLiveBookingsForVenue.mockResolvedValue([aBooking()]);

      const result = await service.updateDraft(staff, 'venue-1', {
        capacity: 419,
      } as VenueDraftDto);

      expect(result.warnings[0].reasons[0]).toContain('from 420 to 419');
    });
  });

  // TC-S1-106 · US-14 AC-4 · unit: updateDraft() · fails if a required field can be blanked on a
  // published venue, or a draft cannot be left incomplete
  describe('AC-4: a required field cannot be blanked on a published venue', () => {
    it.each([
      ['name', { name: null }],
      ['location', { location: null }],
      ['capacity', { capacity: null }],
    ])('refuses to clear %s', async (_label, patch) => {
      await expect(
        service.updateDraft(staff, 'venue-1', patch as VenueDraftDto),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.venue.update).not.toHaveBeenCalled();
    });

    it('names the field that must be filled', async () => {
      const error = await service
        .updateDraft(staff, 'venue-1', { name: null } as VenueDraftDto)
        .catch((e: BadRequestException) => e);

      const messages = (
        (error as BadRequestException).getResponse() as { message: string[] }
      ).message.join(' | ');
      expect(messages).toMatch(/name is required/);
    });

    it('allows clearing on a draft, which may be incomplete', async () => {
      prisma.venue.findUnique.mockResolvedValue(
        venue({ status: VenueStatus.DRAFT }),
      );

      await expect(
        service.updateDraft(staff, 'venue-1', { name: null } as VenueDraftDto),
      ).resolves.toMatchObject({ name: null, warnings: [] });
      // The blank is persisted as null (not refused, as it would be once published).
      expect(prisma.venue.update).toHaveBeenCalledWith({
        where: { id: 'venue-1' },
        data: { name: null },
      });
    });

    it('still allows a genuine edit of a published venue', async () => {
      await expect(
        service.updateDraft(staff, 'venue-1', { name: 'Renamed hall' } as VenueDraftDto),
      ).resolves.toMatchObject({ name: 'Renamed hall' });
    });
  });

  // TC-S1-103 · US-14 AC-1 · unit: findManaged() · fails if another manager's venue can be edited
  describe('ownership', () => {
    it('refuses another manager’s venue', async () => {
      prisma.venue.findUnique.mockResolvedValue(venue({ managedById: 'staff-2' }));

      await expect(
        service.updateDraft(staff, 'venue-1', { capacity: 1 } as VenueDraftDto),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
