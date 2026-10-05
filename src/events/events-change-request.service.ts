import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ChangeRequestStatus, Prisma } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import {
  evaluateChangeRequest,
  isChangeable,
} from './change-request.rules';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';

/** What a client gets back for a change request, equipment resolved to names. */
export const CHANGE_REQUEST_INCLUDE = {
  equipment: {
    include: { equipment: { select: { id: true, type: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.EventChangeRequestInclude;

const ONE_PENDING_MESSAGE =
  'this event already has a pending change request; wait for it to be decided';

/**
 * US-37 — an Organiser asks to change an event they have already submitted.
 *
 * Nothing here edits the event: the request is saved alongside it as PENDING
 * and left for review, so the original details are untouched.
 */
@Injectable()
export class EventsChangeRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
  ) {}

  async request(
    user: AuthenticatedUser,
    eventId: string,
    dto: CreateChangeRequestDto,
  ) {
    // AC "only their own events": an event that is not theirs is reported as
    // not found, like every other event read (see assertEventAccess).
    const event = await this.access.assertEventAccess(
      user,
      eventId,
      Action.REQUEST_CHANGE,
    );

    if (!isChangeable(event.status)) {
      throw new ConflictException(
        `event is ${event.status}; change requests are only available for submitted or confirmed events`,
      );
    }

    const currentEquipment = await this.currentEquipment(event.id);

    const { errors, changed } = evaluateChangeRequest(
      {
        proposedStart: event.proposedStart,
        proposedEnd: event.proposedEnd,
        expectedAttendance: event.expectedAttendance,
        equipment: currentEquipment,
      },
      {
        proposedStart: dto.proposedStart,
        proposedEnd: dto.proposedEnd,
        proposedAttendance: dto.proposedAttendance,
        equipment: dto.equipment,
      },
      new Date(),
    );

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    if (changed.includes('equipment')) {
      await this.assertInCatalogue(dto.equipment ?? []);
    }

    if (await this.findPending(event.id)) {
      throw new ConflictException(ONE_PENDING_MESSAGE);
    }

    // Only fields that differ are stored; the rest are saved as "unchanged".
    const has = (field: (typeof changed)[number]) => changed.includes(field);

    try {
      return await this.prisma.eventChangeRequest.create({
        data: {
          eventId: event.id,
          requestedById: user.userId,
          status: ChangeRequestStatus.PENDING,
          reason: dto.reason,
          proposedStart: has('proposedStart') ? dto.proposedStart : null,
          proposedEnd: has('proposedEnd') ? dto.proposedEnd : null,
          proposedAttendance: has('proposedAttendance')
            ? dto.proposedAttendance
            : null,
          equipmentChanged: has('equipment'),
          equipment: has('equipment')
            ? {
                create: (dto.equipment ?? []).map((line) => ({
                  equipmentId: line.equipmentId,
                  quantity: line.quantity,
                })),
              }
            : undefined,
        },
        include: CHANGE_REQUEST_INCLUDE,
      });
    } catch (error) {
      // Two submits racing past the check above: the partial unique index
      // allows only one PENDING request per event.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(ONE_PENDING_MESSAGE);
      }
      throw error;
    }
  }

  /** The event's undecided change request, or null. */
  findPending(eventId: string) {
    return this.prisma.eventChangeRequest.findFirst({
      where: { eventId, status: ChangeRequestStatus.PENDING },
      include: CHANGE_REQUEST_INCLUDE,
    });
  }

  /**
   * The event's equipment as catalogue lines. Requirements with no catalogue
   * link are not comparable and are left out — and left alone: approving a
   * request only ever replaces the lines it can see.
   */
  private async currentEquipment(eventId: string) {
    const rows = await this.prisma.equipmentRequirement.findMany({
      where: { eventId, equipmentId: { not: null } },
      select: { equipmentId: true, quantity: true },
    });

    return rows.map((row) => ({
      equipmentId: row.equipmentId as string,
      quantity: row.quantity,
    }));
  }

  /** AC "equipment items are selected from the equipment catalogue". */
  private async assertInCatalogue(
    lines: { equipmentId: string }[],
  ): Promise<void> {
    const ids = [...new Set(lines.map((line) => line.equipmentId))];
    if (ids.length === 0) return;

    const found = await this.prisma.equipment.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const known = new Set(found.map((row) => row.id));
    const unknown = ids.filter((id) => !known.has(id));

    if (unknown.length > 0) {
      throw new BadRequestException(
        unknown.map((id) => `equipment item ${id} is not in the catalogue`),
      );
    }
  }
}
