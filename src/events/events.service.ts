import { Injectable } from '@nestjs/common';
import { EventRequest } from '@prisma/client';

import { AccessControlService, PublicEventView } from '../common/access/access-control.service';
import { Action } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

/**
 * US-02 slice only: read paths, to prove ownership scoping end-to-end.
 * Creation, drafting and submission are US-04.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
  ) {}

  /** AC-5 / AC-6: the list is narrowed by the caller's grant, never post-filtered. */
  async findAllForUser(
    user: AuthenticatedUser,
  ): Promise<(EventRequest | PublicEventView)[]> {
    const events = await this.prisma.eventRequest.findMany({
      where: this.access.scopedEventFilter(user),
      orderBy: { createdAt: 'desc' },
    });

    return events.map((event) => this.access.projectEvent(user, event));
  }

  /** AC-5 / AC-6 / AC-7: ownership enforced first, then the view projected. */
  async findOneForUser(
    user: AuthenticatedUser,
    id: string,
  ): Promise<EventRequest | PublicEventView> {
    const event = await this.access.assertEventAccess(user, id, Action.READ);
    return this.access.projectEvent(user, event);
  }
}
