import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Venue, VenueStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { PublishableVenueDto } from './dto/publishable-venue.dto';
import { VenueDraftDto } from './dto/venue-draft.dto';

/**
 * The staff-editable scalar columns, typed as the subset Prisma accepts for
 * both create and update so one mapper serves saveDraft and updateDraft.
 */
type VenueDraftFields = Partial<
  Pick<
    Prisma.VenueUncheckedCreateInput,
    | 'name'
    | 'location'
    | 'capacity'
    | 'facilities'
    | 'accessibilityFeatures'
    | 'supportedLayouts'
    | 'operatingInfo'
  >
>;

@Injectable()
export class VenuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
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

  /** AC-4/AC-5/AC-6 — the catalogue, scoped to the caller. */
  async findAllForUser(user: AuthenticatedUser): Promise<Venue[]> {
    return this.prisma.venue.findMany({
      where: this.visibilityFilter(user),
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
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

  /** AC-1/AC-2 — continue filling in a draft. */
  async updateDraft(
    user: AuthenticatedUser,
    id: string,
    dto: VenueDraftDto,
  ): Promise<Venue> {
    const venue = await this.findManaged(user, id, Action.UPDATE);

    return this.prisma.venue.update({
      where: { id: venue.id },
      data: this.draftFields(dto),
    });
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
      'accessibilityFeatures',
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
