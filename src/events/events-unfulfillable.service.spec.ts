import { ForbiddenException } from '@nestjs/common';
import { EventRequest, EventStatus, Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BookingsService } from '../bookings/bookings.service';
import { AccessControlService } from '../common/access/access-control.service';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnfulfillableReason } from './dto/reject-unfulfillable.dto';
import { EventsService } from './events.service';
import { EventsUnfulfillableService } from './events-unfulfillable.service';

/**
 * US-47 — the two paths the integration tests cannot build: a Coordinator who
 * can see the event but is not assigned to it (since Week 7 Change 5 the access
 * layer already refuses them with 404), and an event with no name. The
 * rejection itself is proven end to end in test/events-reject-unfulfillable.e2e-spec.ts.
 */
describe('US-47 EventsUnfulfillableService', () => {
  const coordinator = { userId: 'coord-1', role: Role.EVENT_COORDINATOR } as AuthenticatedUser;
  const dto = { reason: UnfulfillableReason.NO_SUITABLE_VENUE, comment: 'Nothing fits 120 people.' };
  const planning = {
    id: 'event-1',
    name: 'Gala',
    status: EventStatus.PLANNING,
    organiserId: 'org-1',
    coordinatorId: 'coord-1',
  } as EventRequest;

  const build = (event: EventRequest, assigned = true) => {
    const tx = { eventRequest: { update: jest.fn().mockResolvedValue(event) } };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const access = {
      assertEventAccess: jest.fn().mockResolvedValue(event),
      isAssignedCoordinator: jest.fn().mockReturnValue(assigned),
    };
    const events = { setStatus: jest.fn().mockResolvedValue({ ...event, status: EventStatus.REJECTED }) };
    const notifications = { notifySafely: jest.fn() };
    const service = new EventsUnfulfillableService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      events as unknown as EventsService,
      { releaseForEvent: jest.fn().mockResolvedValue(0) } as unknown as BookingsService,
      { releaseForCancelledEvent: jest.fn().mockResolvedValue(0) } as unknown as EquipmentReservationsService,
      notifications as unknown as NotificationsService,
    );
    return { service, prisma, notifications };
  };

  // TC-S3-107 · US-47 AC-1 · setup: none (unit) · fails if a Coordinator who is not assigned to the event can reject it
  // Code: EventsUnfulfillableService.reject (isAssignedCoordinator)
  it('refuses a Coordinator who is not assigned to the event, changing nothing', async () => {
    const { service, prisma } = build(planning, false);

    await expect(service.reject(coordinator, 'event-1', dto)).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // TC-S3-112 · US-47 AC-6 · setup: none (unit) · fails if rejecting an event with no name breaks the Organiser's notice
  // Code: EventsUnfulfillableService.reject (name fallback)
  it("words the Organiser's notice for an event with no name", async () => {
    const { service, notifications } = build({ ...planning, name: null });

    await service.reject(coordinator, 'event-1', dto);

    expect(notifications.notifySafely).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'org-1',
        message:
          'Your event request "Untitled event" has been rejected because it cannot be fulfilled. Reason: No suitable venue: Nothing fits 120 people.',
      }),
    );
  });
});
