import { ConflictException, NotFoundException } from '@nestjs/common';
import { EquipmentStatus, EquipmentSuggestionStatus, EventStatus, ReservationStatus, Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { EquipmentNotifier } from '../equipment/equipment-notifier';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { EquipmentShortageService } from '../equipment/equipment-shortage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EquipmentShortageActionsService } from './equipment-shortage-actions.service';
import { EventsService } from './events.service';

/**
 * US-45 / US-67 — backstops the running app cannot reach, forced here with a
 * mocked database so each still behaves as meant if its guarantee is lost:
 *  - an event with no name: the database requires a name on every event that
 *    is not a draft, and only a confirmed event gets suggestions;
 *  - accepting when the reservation holds fewer units than suggested: reducing
 *    it closes every open suggestion for more than it keeps;
 *  - accepting when the alternative item is gone: a suggestion's foreign key
 *    keeps the item.
 * Everything reachable is proven against the test database in
 * test/equipment-shortage.e2e-spec.ts.
 */
describe('US-45 EquipmentShortageActionsService backstops', () => {
  const toby = { userId: 'USR-009', role: Role.TECHNICAL_SUPPORT_STAFF } as AuthenticatedUser;
  const cody = { userId: 'USR-004', role: Role.EVENT_COORDINATOR } as AuthenticatedUser;
  const start = new Date(Date.now() + 864e5);
  const end = new Date(Date.now() + 2 * 864e5);
  // 5 reserved on an item with 2 working: short by 3.
  const reservation = (quantity = 5) => ({
    id: 'RSV-1',
    eventId: 'EVT-1',
    equipmentId: 'EQP-1',
    quantity,
    start,
    end,
    status: ReservationStatus.APPROVED,
    equipment: { type: 'Projector' },
    event: { id: 'EVT-1', name: null, status: EventStatus.CONFIRMED, coordinatorId: 'USR-004', technicalSupportId: null },
  });
  const suggestion = (quantity = 3) => ({
    id: 'ESG-1',
    reservationId: 'RSV-1',
    alternativeEquipmentId: 'EQP-2',
    alternativeEquipment: { type: 'Laser projector' },
    quantity,
    reason: 'Same brightness',
    suggestedById: 'USR-009',
    reservation: reservation(),
  });

  const build = (held = reservation(), alternative: object | null = { id: 'EQP-2', type: 'Laser projector', totalQuantity: 4, operationalStatus: EquipmentStatus.OPERATIONAL, damagedQuantity: 0, maintenanceQuantity: 0 }) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: EquipmentSuggestionStatus.OPEN }]),
      equipment: {
        findMany: jest.fn().mockResolvedValue([{ id: 'EQP-1', totalQuantity: 5, damagedQuantity: 3, maintenanceQuantity: 0 }]),
        findUnique: jest.fn().mockResolvedValue(alternative),
      },
      equipmentReservation: {
        findUnique: jest.fn().mockResolvedValue({ equipmentId: 'EQP-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(held),
        // loadShortages selects the id; the alternative's held units do not.
        findMany: jest.fn((args: { select: { id?: boolean } }) => Promise.resolve(args.select.id ? [held] : [])),
        update: jest.fn(),
      },
      equipmentSuggestion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ESG-1' }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn) => fn(tx)),
      equipmentSuggestion: { findUnique: jest.fn().mockResolvedValue(suggestion()) },
    };
    const notifier = { reservationAdjusted: jest.fn(), noAlternative: jest.fn(), alternativeSuggested: jest.fn() };
    const notifications = { notify: jest.fn() };
    const reservations = { lockEquipment: jest.fn(), releaseOne: jest.fn(), createCommitted: jest.fn().mockResolvedValue({ id: 'RSV-2' }) };
    const service = new EquipmentShortageActionsService(
      prisma as unknown as PrismaService,
      { requireScope: jest.fn() } as unknown as AccessControlService,
      { recordChange: jest.fn() } as unknown as EventsService,
      reservations as unknown as EquipmentReservationsService,
      {} as EquipmentShortageService,
      notifier as unknown as EquipmentNotifier,
      notifications as unknown as NotificationsService,
    );
    return { service, prisma, tx, notifier, notifications };
  };

  // TC-S3-98, TC-S3-95, TC-S3-97 · US-45 AC-11, AC-8, AC-10 · unit: EquipmentShortageActionsService, database mocked · fails if a notice cannot be worded for an event with no name
  // Code: EquipmentShortageActionsService.reduce / release / noAlternative / suggest / accept / decline (name ?? 'an event')
  it('words every notice for an event with no name as "an event"', async () => {
    const { service, notifier, notifications } = build();

    await service.reduce(toby, 'RSV-1', { quantity: 2, reason: 'x' });
    await service.release(toby, 'RSV-1', { reason: 'x' });
    await service.noAlternative(toby, 'RSV-1', { reason: 'x' });
    await service.suggest(toby, 'RSV-1', { alternativeEquipmentId: 'EQP-2', quantity: 3, reason: 'x' });
    await service.accept(cody, 'ESG-1');
    await service.decline(cody, 'ESG-1');

    const messages = [
      ...notifier.reservationAdjusted.mock.calls,
      ...notifier.noAlternative.mock.calls,
      ...notifier.alternativeSuggested.mock.calls,
    ].map((call) => call[2] as string);
    messages.push(...notifications.notify.mock.calls.map(([n]) => n.message as string));
    expect(messages).toHaveLength(6);
    for (const message of messages) expect(message).toContain('"an event"');
  });

  // TC-S3-97, TC-S4-110 · US-45 AC-10, US-67 AC-4 · unit: accept(), database mocked · fails if a suggestion for more units than the reservation still holds can be accepted
  // Code: EquipmentShortageActionsService.accept (r.quantity < suggestion.quantity -> INVALID)
  it('refuses to accept, closing the suggestion, when the reservation now holds fewer units than suggested', async () => {
    const { service, tx } = build(reservation(2));

    await expect(service.accept(cody, 'ESG-1')).rejects.toThrow(
      new ConflictException('This suggestion is no longer valid: the short reservation now holds only 2.'),
    );
    expect(tx.equipmentSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: EquipmentSuggestionStatus.INVALID }) }),
    );
  });

  // TC-S3-97, TC-S4-110 · US-45 AC-10, US-67 AC-4 · unit: accept(), database mocked · fails if accepting goes ahead when the alternative item cannot be found
  // Code: EquipmentShortageActionsService.freeUnitsOf (404)
  it('404s when the alternative item cannot be found inside the transaction', async () => {
    const { service, tx } = build(reservation(), null);

    await expect(service.accept(cody, 'ESG-1')).rejects.toThrow(new NotFoundException('alternative equipment not found'));
    expect(tx.equipmentSuggestion.update).not.toHaveBeenCalled();
  });
});
