import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, NotificationType, Prisma, Venue, VenueStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { VenueBookingLookup } from '../bookings/booking-impact';
import { freeVenueIds, NO_BUFFERS, occupancySegments } from '../bookings/venue-occupancy';
import { BookingReviewService, recheckReviewFlags } from '../bookings/booking-review.service';
import { BufferClash } from '../bookings/buffer-clashes';
import { lockVenue } from '../bookings/venue-lock';
import { EquipmentService } from '../equipment/equipment.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BrowseVenuesDto,
  SortOrder,
  VenueSortField,
} from './dto/browse-venues.dto';
import { PublishableVenueDto } from './dto/publishable-venue.dto';
import {
  DayAvailabilityDto,
  VenueAvailabilityQueryDto,
  VenueOccupancyDto,
} from './dto/venue-availability.dto';
import {
  aggregateAvailability,
  DayStatus,
  rangeBounds,
  resolveRange,
} from './availability';
import { UpdateVenueBuffersDto, VenueBuffersDto } from './dto/venue-buffers.dto';
import { VenueDraftDto } from './dto/venue-draft.dto';
import { VenueSearchDto } from './dto/venue-search.dto';
import { assessSuitability, VenueSuitability } from './suitability';
import { SupabaseStorageService } from '../storage/supabase-storage.service';

/**
 * The staff-editable scalar columns, typed as the subset Prisma accepts for
 * both create and update so one mapper serves saveDraft and updateDraft.
 */
/**
 * US-14 AC-3 — a warning attached to an update, telling the staff member that
 * existing bookings may no longer be valid.
 */
export interface VenueUpdateWarning {
  code: 'BOOKINGS_MAY_NEED_REVIEW';
  message: string;
  /** What about the venue changed for the worse. */
  reasons: string[];
  affectedBookingIds: string[];
}

export type VenueWithWarnings = Venue & { warnings: VenueUpdateWarning[] };

type VenueDraftFields = Partial<
  Pick<
    Prisma.VenueUncheckedCreateInput,
    | 'name'
    | 'location'
    | 'capacity'
    | 'facilities'
    | 'facilityNotes'
    | 'accessibilityFeatures'
    | 'accessibilityNotes'
    | 'supportedLayouts'
    | 'operatingInfo'
  >
>;

@Injectable()
export class VenuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly bookings: VenueBookingLookup,
    private readonly notifications: NotificationsService,
    private readonly storage: SupabaseStorageService,
    private readonly events: EventsService,
    private readonly reviews: BookingReviewService,
    // US-19 AC-3: free units of the equipment an event asks for.
    private readonly equipment: EquipmentService,
  ) {}

  /**
   * US-13 AC-4 — what this caller may see of the catalogue.
   *
   * Published entries are visible to everyone with a VENUE/READ grant. Drafts
   * are visible only to the Venue Staff member managing them, which is what
   * keeps an unfinished entry out of a Coordinator's search results.
   *
   * Expressed as a Prisma filter rather than a post-fetch filter so a draft is
   * never loaded for someone who may not see it, and counts stay correct.
   */
  visibilityFilter(user: AuthenticatedUser): Prisma.VenueWhereInput {
    this.access.requireScope(user, Resource.VENUE, Action.READ);

    return {
      OR: [
        { status: VenueStatus.PUBLISHED },
        { status: VenueStatus.DRAFT, managedById: user.userId },
      ],
    };
  }

  /**
   * US-13 AC-4/AC-6 and US-15 AC-1/AC-3/AC-4 — the catalogue, scoped to the
   * caller and optionally searched or sorted.
   *
   * AC-4: read straight from the database on every call. Nothing is cached
   * server-side, so a venue added or edited a moment ago is present in the
   * next response.
   *
   * AMBIGUOUS: the list returns whole venue records rather than a trimmed
   * summary. AC-1 asks for key details "at a glance", which those records
   * satisfy; a narrower projection would be a payload optimisation, and would
   * break clients already reading layouts from the list. See the summary.
   */
  async findAllForUser(
    user: AuthenticatedUser,
    query: BrowseVenuesDto = {},
  ): Promise<Venue[]> {
    const visibility = this.visibilityFilter(user);

    const where: Prisma.VenueWhereInput = query.search
      ? {
          AND: [
            visibility,
            { name: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : visibility;

    return this.prisma.venue.findMany({
      where,
      orderBy: this.orderBy(query),
    });
  }

  /**
   * AC-3 — sorting. Defaults to name ascending, which is what a person
   * scanning a catalogue expects.
   *
   * Drafts sort first so a Venue Staff member sees their unfinished work
   * before the published list; nulls sort last, so a half-filled draft does
   * not push a named venue down the page.
   */
  private orderBy(query: BrowseVenuesDto): Prisma.VenueOrderByWithRelationInput[] {
    const field = query.sortBy ?? VenueSortField.NAME;
    const order = query.sortOrder ?? SortOrder.ASC;

    return [
      { status: 'asc' },
      { [field]: { sort: order, nulls: 'last' } } as Prisma.VenueOrderByWithRelationInput,
    ];
  }

  /** A single entry, denied as not-found when outside the caller's view. */
  async findOneForUser(user: AuthenticatedUser, id: string): Promise<Venue> {
    const venue = await this.prisma.venue.findFirst({
      where: { AND: [{ id }, this.visibilityFilter(user)] },
    });

    if (!venue) {
      throw new NotFoundException('venue not found');
    }

    return venue;
  }

  /**
   * US-18 — published venues matching every active filter.
   *
   * One query for every filter but the date; the date filter (US-50: buffer
   * aware) adds a fixed two, whatever the number of venues — never an
   * availability check per venue (AC-7). Containment filters use the GIN
   * indexes on the two arrays.
   *
   * AC-6: no match is an empty array, not an error.
   */
  async search(user: AuthenticatedUser, query: VenueSearchDto): Promise<Venue[]> {
    // The date filter reveals booking state, so this is the US-17 grant rather
    // than plain VENUE/READ.
    this.access.requireScope(user, Resource.VENUE, Action.CHECK_AVAILABILITY);

    if (Boolean(query.from) !== Boolean(query.to)) {
      throw new BadRequestException('from and to must be given together');
    }

    const where: Prisma.VenueWhereInput = {
      // Drafts are never bookable, whatever else matches.
      status: VenueStatus.PUBLISHED,
    };

    if (query.name) {
      // US-15 AC-3, restored: same matching as the catalogue's name lookup.
      where.name = { contains: query.name, mode: 'insensitive' };
    }

    if (query.minCapacity !== undefined) {
      // AC-2. A null capacity never satisfies gte, so it is excluded rather
      // than compared (and the US-13 CHECK forbids it on a published venue).
      where.capacity = { gte: query.minCapacity };
    }

    if (query.accessibility?.length) {
      // AC-3: every selected feature, not any.
      where.accessibilityFeatures = { hasEvery: query.accessibility };
    }

    if (query.facilities?.length) {
      // AC-4: likewise.
      where.facilities = { hasEvery: query.facilities };
    }

    const venues = await this.prisma.venue.findMany({
      where,
      orderBy: [{ name: 'asc' }],
    });

    if (!(query.from && query.to)) {
      return venues;
    }

    // AC-1: free of *confirmed* bookings in the slot. US-50 AC-5: judged with
    // each venue's own setup and turnaround time, so a venue held only by the
    // buffer around another booking is not free. Buffers differ per venue,
    // so this is the shared check (bookings/venue-occupancy.ts) over the
    // matching venues — two more queries, not one per venue.
    const free = await freeVenueIds(
      this.prisma,
      venues,
      { start: new Date(query.from), end: new Date(query.to) },
      { includeBlocks: false },
    );
    return venues.filter((venue) => free.has(venue.id));
  }

  /**
   * US-20 — does this venue appear suitable for this event?
   *
   * Read-only and advisory (AC-5): it reports, it never gates. Nothing in the
   * booking flow may call this as a precondition.
   *
   * AC-6: two indexed lookups by primary key, run in parallel — one venue and
   * one event — then a pure comparison. Deliberately not US-18's search query,
   * which filters across every venue.
   */
  async getSuitability(
    user: AuthenticatedUser,
    venueId: string,
    eventId: string,
  ): Promise<VenueSuitability> {
    this.access.requireScope(user, Resource.VENUE, Action.CHECK_AVAILABILITY);

    const [venue, event] = await Promise.all([
      this.prisma.venue.findFirst({
        where: { id: venueId, status: VenueStatus.PUBLISHED },
        select: {
          capacity: true,
          accessibilityFeatures: true,
          supportedLayouts: true,
          facilities: true,
        },
      }),
      this.events.findSuitabilityRequirements(user, eventId),
    ]);

    if (!venue) {
      throw new NotFoundException('venue not found');
    }

    // AC-3: counted only once the event is known to be this Coordinator's.
    const equipment = await this.equipment.freeUnitsForEventRequirements(
      event.id,
      event.proposedStart && event.proposedEnd
        ? { start: event.proposedStart, end: event.proposedEnd }
        : null,
    );

    return assessSuitability(venue, event, equipment);
  }

  /**
   * US-17 — a venue's calendar as one free/tentative/booked status per day.
   *
   * The CHECK_AVAILABILITY grant is PUBLIC-scoped: published venues only, so
   * a draft answers 404 exactly as it does on GET /venues/:id, and its
   * existence is not confirmed.
   *
   * AC-3: nothing identifying a booking crosses this boundary. The lookup
   * returns anonymous slots, and the result is serialised through
   * DayAvailabilityDto, which drops any property it does not declare.
   */
  async getAvailability(
    user: AuthenticatedUser,
    id: string,
    query: VenueAvailabilityQueryDto,
    now: Date = new Date(),
  ): Promise<DayAvailabilityDto[]> {
    this.access.requireScope(user, Resource.VENUE, Action.CHECK_AVAILABILITY);

    const venue = await this.prisma.venue.findFirst({
      where: { id, status: VenueStatus.PUBLISHED },
      select: { id: true },
    });
    if (!venue) {
      throw new NotFoundException('venue not found');
    }

    const range = resolveRange(query, now);
    const { from, to } = rangeBounds(range);
    // AC-1: bookings and blocked-off periods, both.
    const [slots, blocks] = await Promise.all([
      this.bookings.findBookingSlotsForVenue(id, from, to),
      this.bookings.findBlockWindowsForVenue(id, from, to),
    ]);

    return plainToInstance(
      DayAvailabilityDto,
      aggregateAvailability(range, slots, blocks),
      { excludeExtraneousValues: true },
    );
  }

  /**
   * US-50 AC-3 — what occupies this venue over a day range, each booking
   * split into setup, event time and turnaround, for the availability
   * calendar to draw separately. Same grant, venue rule and range rules as
   * getAvailability (US-17), and as anonymous: no event, organiser or booking
   * id crosses this boundary (VenueOccupancyDto).
   *
   * US-17 AC-1: a blocked-off period is listed too, as one BLOCKED segment,
   * so a Coordinator can see which hours of a part-blocked day are still
   * free. Its reason and author are not included. Entries are earliest first.
   */
  async getOccupancy(
    user: AuthenticatedUser,
    id: string,
    query: VenueAvailabilityQueryDto,
    now: Date = new Date(),
  ): Promise<VenueOccupancyDto[]> {
    this.access.requireScope(user, Resource.VENUE, Action.CHECK_AVAILABILITY);

    const venue = await this.prisma.venue.findFirst({
      where: { id, status: VenueStatus.PUBLISHED },
      select: { id: true },
    });
    if (!venue) {
      throw new NotFoundException('venue not found');
    }

    const { from, to } = rangeBounds(resolveRange(query, now));
    const [slots, blocks] = await Promise.all([
      this.bookings.findBookingSlotsForVenue(id, from, to),
      this.bookings.findBlockWindowsForVenue(id, from, to),
    ]);

    const entries = [
      ...slots.map((slot) => ({
        status: slot.status === BookingStatus.APPROVED ? DayStatus.BOOKED : DayStatus.TENTATIVE,
        segments: occupancySegments(slot, slot.buffers ?? NO_BUFFERS),
      })),
      ...blocks.map((block) => ({
        status: DayStatus.BLOCKED,
        segments: [{ kind: 'BLOCKED' as const, start: block.start, end: block.end }],
      })),
    ].sort((a, b) => a.segments[0].start.getTime() - b.segments[0].start.getTime());

    return plainToInstance(
      VenueOccupancyDto,
      entries,
      { excludeExtraneousValues: true },
    );
  }

  /**
   * US-13 AC-1/AC-2 — save a venue as a draft, however incomplete.
   *
   * The creator becomes the managing staff member, which is what AC-4's
   * visibility rule keys off.
   */
  async saveDraft(user: AuthenticatedUser, dto: VenueDraftDto): Promise<Venue> {
    this.access.requireScope(user, Resource.VENUE, Action.CREATE);

    return this.prisma.venue.create({
      data: {
        ...this.draftFields(dto),
        managedById: user.userId,
        // status omitted — DRAFT is the schema default, and publishing is a
        // transition rather than a field write.
      },
    });
  }

  /**
   * US-13 AC-1/AC-2 and US-14 AC-1/AC-2/AC-4 — edit a venue.
   *
   * The same method serves a half-finished draft and a live catalogue entry;
   * what differs is how strict it is. A draft may be left incomplete (US-13
   * AC-2), a published venue may not (US-14 AC-4), so the completeness rules
   * are applied only when the entry is published.
   */
  async updateDraft(
    user: AuthenticatedUser,
    id: string,
    dto: VenueDraftDto,
  ): Promise<VenueWithWarnings> {
    const venue = await this.findManaged(user, id, Action.UPDATE);
    const changes = this.draftFields(dto);

    // AC-4: what the record would look like after this edit.
    const merged = { ...venue, ...changes } as Venue;

    if (venue.status === VenueStatus.PUBLISHED) {
      await this.assertPublishable(merged);
    }

    // AC-3: assessed BEFORE writing, so the reasons compare the old record
    // against the new one.
    const warning = await this.assessBookingImpact(venue, merged);

    const updated = await this.prisma.venue.update({
      where: { id: venue.id },
      data: changes,
    });

    if (warning) {
      // Durable as well as immediate: the staff member sees the warning in the
      // response, and it survives them navigating away.
      await this.notifications.notifySafely({
        recipientId: user.userId,
        type: NotificationType.VENUE_CHANGED_BOOKINGS_AFFECTED,
        message: warning.message,
      });
    }

    return { ...updated, warnings: warning ? [warning] : [] };
  }

  /**
   * US-49 — set a venue's setup and turnaround time.
   *
   * Only the managing Venue Staff member (AC-4); anyone else gets the same
   * not-found as every other venue write (findManaged). Draft and published
   * venues alike. Writes only the two buffer columns.
   *
   * US-51 — before saving, the venue's future bookings are re-checked under
   * the proposed buffers. New clashes refuse the save with a 409 listing them
   * (AC-3/AC-4) unless `confirmConflicts` is set; then the buffers are saved
   * and each clashing booking is flagged "Conflict - needs review" (AC-5),
   * all in one transaction under the venue lock, so no booking can be
   * requested or decided between the check and the save. Bookings are never
   * moved, cancelled or re-statused (AC-6).
   */
  async updateBuffers(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateVenueBuffersDto,
  ): Promise<Venue & { flagged: number }> {
    const venue = await this.findManaged(user, id, Action.UPDATE);
    const proposed = {
      setupMinutes: dto.setupMinutes,
      turnaroundMinutes: dto.turnaroundMinutes,
    };

    return this.prisma.$transaction(async (tx) => {
      await lockVenue(tx, venue.id);

      // Re-read under the lock: the buffers may have changed since.
      const current = await tx.venue.findUniqueOrThrow({
        where: { id: venue.id },
        select: { setupMinutes: true, turnaroundMinutes: true },
      });
      const clashes = await this.reviews.previewBufferChange(tx, venue.id, current, proposed);

      if (clashes.length > 0 && !dto.confirmConflicts) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message:
            'these buffer times would make existing bookings clash; confirm to save anyway and flag them for review',
          clashes,
        });
      }

      const updated = await tx.venue.update({ where: { id: venue.id }, data: proposed });
      const flagged = clashes.length > 0 ? await this.reviews.flag(tx, clashes, proposed) : 0;
      // Lowering a buffer may end earlier clashes: clear those flags.
      await recheckReviewFlags(venue.id, tx);

      return { ...updated, flagged };
    });
  }

  /**
   * US-51 AC-3 — what saving these buffers would flag, without saving. Same
   * permission rule as the save. Advisory: the save checks again under the
   * lock, since bookings may change in between.
   */
  async previewBuffers(
    user: AuthenticatedUser,
    id: string,
    dto: VenueBuffersDto,
  ): Promise<{ clashes: BufferClash[] }> {
    const venue = await this.findManaged(user, id, Action.UPDATE);
    const clashes = await this.reviews.previewBufferChange(
      this.prisma,
      venue.id,
      { setupMinutes: venue.setupMinutes, turnaroundMinutes: venue.turnaroundMinutes },
      { setupMinutes: dto.setupMinutes, turnaroundMinutes: dto.turnaroundMinutes },
    );
    return { clashes };
  }

  /**
   * US-14 AC-3 — does this edit put existing bookings at risk?
   *
   * AMBIGUOUS: "details that could affect suitability" is read as changes that
   * make the venue *less* capable — capacity reduced, a supported layout
   * withdrawn, an accessibility feature removed, or the venue relocated.
   * Additions cannot invalidate a booking, so they raise nothing.
   *
   * Only the warning is US-14's job. Re-validating each booking against its
   * event, and deciding what happens to one that no longer fits, belongs to
   * E5 — see VenueBookingLookup.
   */
  private async assessBookingImpact(
    before: Venue,
    after: Venue,
  ): Promise<VenueUpdateWarning | null> {
    const reasons: string[] = [];

    if (
      after.capacity !== null &&
      before.capacity !== null &&
      after.capacity < before.capacity
    ) {
      reasons.push(
        `capacity reduced from ${before.capacity} to ${after.capacity}`,
      );
    }

    const withdrawnLayouts = before.supportedLayouts.filter(
      (layout) => !after.supportedLayouts.includes(layout),
    );
    if (withdrawnLayouts.length > 0) {
      reasons.push(`layouts no longer supported: ${withdrawnLayouts.join(', ')}`);
    }

    const removedAccess = before.accessibilityFeatures.filter(
      (feature) => !after.accessibilityFeatures.includes(feature),
    );
    if (removedAccess.length > 0) {
      reasons.push(`accessibility features removed: ${removedAccess.join(', ')}`);
    }

    if (before.location !== null && after.location !== before.location) {
      reasons.push(
        `location changed from "${before.location}" to "${after.location}"`,
      );
    }

    if (reasons.length === 0) {
      return null;
    }

    const live = await this.bookings.findLiveBookingsForVenue(before.id);

    if (live.length === 0) {
      return null;
    }

    return {
      code: 'BOOKINGS_MAY_NEED_REVIEW',
      message:
        `${live.length} existing booking(s) on this venue may need review: ` +
        reasons.join('; '),
      reasons,
      affectedBookingIds: live.map((booking) => booking.bookingId),
    };
  }

  /**
   * US-13 AC-3/AC-5 — publish, once the entry is complete.
   *
   * The completeness check validates the *stored* record against
   * PublishableVenueDto, so a venue assembled over several edits is judged by
   * the same rules as one filled in at once.
   */
  async publish(user: AuthenticatedUser, id: string): Promise<Venue> {
    const venue = await this.findManaged(user, id, Action.PUBLISH);

    if (venue.status === VenueStatus.PUBLISHED) {
      // Idempotent: publishing twice is not an error.
      return venue;
    }

    await this.assertPublishable(venue);

    return this.prisma.venue.update({
      where: { id: venue.id },
      data: { status: VenueStatus.PUBLISHED },
    });
  }

  /**
   * Permanently deletes a venue. The database's Restrict constraint on
   * VenueBooking blocks this while any booking still references it (P2003) —
   * caught here and turned into a clear 409 instead of a raw Prisma error
   * leaking through to the client.
   */
  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const venue = await this.findManaged(user, id, Action.UPDATE);

    try {
      await this.prisma.venue.delete({ where: { id: venue.id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'This venue has existing bookings and cannot be deleted.',
        );
      }
      throw error;
    }
  }

  /**
   * Uploads one image to Supabase Storage and appends its public URL to the
   * venue's photo carousel. Ownership is checked the same way every other
   * write is (findManaged) — the upload itself never runs for a venue this
   * staff member doesn't manage.
   */
  async addImage(
    user: AuthenticatedUser,
    id: string,
    file: Express.Multer.File,
  ): Promise<Venue> {
    const venue = await this.findManaged(user, id, Action.UPDATE);
    const url = await this.storage.uploadVenueImage(venue.id, file);

    return this.prisma.venue.update({
      where: { id: venue.id },
      data: { imageUrls: { push: url } },
    });
  }

  /**
   * Removes one image URL from the venue's photo carousel. Only drops the
   * database reference — the file itself stays in Supabase Storage, which is
   * an acceptable tradeoff here rather than adding a second failure mode
   * (what happens if the DB update succeeds but the storage delete fails,
   * or vice versa).
   */
  async removeImage(
    user: AuthenticatedUser,
    id: string,
    imageUrl: string,
  ): Promise<Venue> {
    const venue = await this.findManaged(user, id, Action.UPDATE);

    return this.prisma.venue.update({
      where: { id: venue.id },
      data: { imageUrls: venue.imageUrls.filter((u) => u !== imageUrl) },
    });
  }

  /**
   * Loads a venue this staff member manages.
   *
   * Reports a venue owned by someone else as 404 rather than 403, matching the
   * decision made for events in US-02: a 403 would confirm the entry exists.
   */
  private async findManaged(
    user: AuthenticatedUser,
    id: string,
    action: Action,
  ): Promise<Venue> {
    this.access.requireScope(user, Resource.VENUE, action);

    const venue = await this.prisma.venue.findUnique({ where: { id } });

    if (!venue) {
      throw new NotFoundException('venue not found');
    }

    if (venue.managedById !== user.userId) {
      throw new NotFoundException('venue not found');
    }

    return venue;
  }

  /** AC-3 — blocks publication and names every missing field at once. */
  private async assertPublishable(venue: Venue): Promise<void> {
    const candidate = plainToInstance(PublishableVenueDto, {
      name: venue.name ?? undefined,
      location: venue.location ?? undefined,
      capacity: venue.capacity ?? undefined,
    });

    const errors = await validate(candidate, { whitelist: true });

    if (errors.length > 0) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }
  }

  /** Only the keys the caller sent, so a partial edit blanks nothing. */
  private draftFields(dto: VenueDraftDto): VenueDraftFields {
    const fields: Record<string, unknown> = {};

    for (const key of [
      'name',
      'location',
      'capacity',
      'facilities',
      'facilityNotes',
      'accessibilityFeatures',
      'accessibilityNotes',
      'supportedLayouts',
      'operatingInfo',
    ] as const) {
      if (dto[key] !== undefined) {
        fields[key] = dto[key];
      }
    }

    return fields as VenueDraftFields;
  }
}