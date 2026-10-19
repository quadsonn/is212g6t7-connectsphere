import { ReservationStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EquipmentReservationsService } from './equipment-reservations.service';

/**
 * US-48 AC-7 — an approved change request moves the event, so each reservation
 * is rebooked for the new time and the original released afterwards. Replaces
 * US-38's release, which gave the units back for Technical Support to commit
 * again.
 */
describe('EquipmentReservationsService.rebookForEventChange (US-48 AC-7)', () => {
  const oldWindow = { start: new Date('2030-10-01T09:00:00Z'), end: new Date('2030-10-01T17:00:00Z') };
  const to = { start: new Date('2030-10-08T09:00:00Z'), end: new Date('2030-10-08T17:00:00Z') };

  const held = (overrides: Record<string, unknown> = {}) => ({
    id: 'res-1',
    equipmentId: 'eq-1',
    quantity: 5,
    status: ReservationStatus.APPROVED,
    ...oldWindow,
    equipment: { type: 'Projector' },
    ...overrides,
  });

  let tx: { equipmentReservation: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock } };
  let calls: string[];
  let service: EquipmentReservationsService;

  beforeEach(() => {
    calls = [];
    let n = 0;
    tx = {
      equipmentReservation: {
        findMany: jest.fn().mockResolvedValue([held()]),
        create: jest.fn().mockImplementation(() => {
          calls.push('create');
          return Promise.resolve({ id: `new-${++n}` });
        }),
        update: jest.fn().mockImplementation(({ where }) => {
          calls.push(`release ${where.id}`);
          return Promise.resolve({});
        }),
      },
    };
    service = new EquipmentReservationsService(
      {} as PrismaService,
      {} as AccessControlService,
      {} as NotificationsService,
    );
  });

  const run = () => service.rebookForEventChange('event-1', to, tx as never);

  it('US-48 AC-7: looks only at this event’s reservations still holding or awaiting units', async () => {
    await run();

    expect(tx.equipmentReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: 'event-1',
          status: { in: [ReservationStatus.REQUESTED, ReservationStatus.APPROVED] },
        },
      }),
    );
  });

  it('US-48 AC-7: reserves the same item and quantity for the new time, keeping its status', async () => {
    await run();

    expect(tx.equipmentReservation.create).toHaveBeenCalledWith({
      data: {
        eventId: 'event-1',
        equipmentId: 'eq-1',
        quantity: 5,
        start: to.start,
        end: to.end,
        status: ReservationStatus.APPROVED,
      },
    });
  });

  it('US-48 AC-7: releases the originals only after every replacement exists, linking each', async () => {
    tx.equipmentReservation.findMany.mockResolvedValue([
      held(),
      held({ id: 'res-2', equipmentId: 'eq-2', status: ReservationStatus.REQUESTED, equipment: { type: 'Microphone' } }),
    ]);

    await run();

    expect(calls).toEqual(['create', 'create', 'release res-1', 'release res-2']);
    expect(tx.equipmentReservation.update).toHaveBeenCalledWith({
      where: { id: 'res-1' },
      data: { status: ReservationStatus.RELEASED, releasedAt: expect.any(Date), replacedById: 'new-1' },
    });
  });

  it('US-48 AC-7: reports each original, its replacement, and where it was and is now', async () => {
    await expect(run()).resolves.toEqual([
      {
        reservationId: 'res-1',
        replacementId: 'new-1',
        equipmentId: 'eq-1',
        equipmentType: 'Projector',
        quantity: 5,
        status: ReservationStatus.APPROVED,
        from: oldWindow,
        to,
      },
    ]);
  });

  it('US-48: writes nothing when the event holds no reservations', async () => {
    tx.equipmentReservation.findMany.mockResolvedValue([]);

    await expect(run()).resolves.toEqual([]);
    expect(tx.equipmentReservation.create).not.toHaveBeenCalled();
    expect(tx.equipmentReservation.update).not.toHaveBeenCalled();
  });
});
