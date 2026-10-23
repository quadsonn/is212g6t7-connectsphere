import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { liveBookingsWhere } from '../bookings/booking-overlap';
import { TECH_SUPPORT_ASSIGNABLE_STATUSES } from '../events/technical-support.rules';
import { PrismaService } from '../prisma/prisma.service';
import {
  EVENT_SELECT,
  EventRequirementsView,
  toRequirementsView,
} from './equipment-requirements.service';

/** A venue the event uses or has asked for, as the assignment list shows it. */
export interface AssignmentVenue {
  bookingId: string;
  venueName: string | null;
  status: BookingStatus;
  start: Date;
  end: Date;
}

/**
 * US-61 AC-3 — one event in a Technical Support member's assignment list: its
 * date and time and requirements (the US-30 view), and its venues.
 */
export interface TechnicalSupportAssignment extends EventRequirementsView {
  venues: AssignmentVenue[];
}

/**
 * US-61 AC-3 — the events a Technical Support member is assigned to.
 *
 * Lives in the equipment module beside the requirements view it reuses;
 * the assignment itself is written by EventsTechnicalSupportService. Only
 * events still under way are listed: once cancelled, rejected or completed an
 * event no longer needs its assignee.
 */
@Injectable()
export class TechnicalSupportAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
  ) {}

  /** Soonest first. Venues are every live booking: pending, approved or held. */
  async findMine(user: AuthenticatedUser): Promise<TechnicalSupportAssignment[]> {
    this.access.requireScope(user, Resource.EQUIPMENT, Action.READ);

    const events = await this.prisma.eventRequest.findMany({
      where: {
        technicalSupportId: user.userId,
        status: { in: [...TECH_SUPPORT_ASSIGNABLE_STATUSES] },
      },
      orderBy: [{ proposedStart: 'asc' }, { id: 'asc' }],
      select: {
        ...EVENT_SELECT,
        venueBookings: {
          where: liveBookingsWhere(),
          orderBy: [{ start: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            status: true,
            start: true,
            end: true,
            venue: { select: { name: true } },
          },
        },
      },
    });

    return events.map(({ venueBookings, ...event }) => ({
      ...toRequirementsView(event),
      venues: venueBookings.map((b) => ({
        bookingId: b.id,
        venueName: b.venue.name,
        status: b.status,
        start: b.start,
        end: b.end,
      })),
    }));
  }
}
