import { ReservationStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EquipmentReservationsService } from './equipment-reservations.service';

/** US-37 — an event's dates change, so the equipment it holds is given back. */
describe('EquipmentReservationsService.releaseForRescheduledEvent (US-37)', () => {
  const held = (overrides: Record<string, unknown> = {}) => ({
    id: 'res-1',
    quantity: 5,
    status: ReservationStatus.APPROVED,
    equipment: { type: 'Projector' },
    ...overrides,
  });

  let tx: {
    equipmentReservation: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let service: EquipmentReservationsService;

  beforeEach(() => {
    tx = {
      equipmentReservation: {
        findMany: jest.fn().mockResolvedValue([held()]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new EquipmentReservationsService(
      {} as PrismaService,
      {} as AccessControlService,
      {} as NotificationsService,
    );
  });

  const run = () => service.releaseForRescheduledEvent('event-1', tx as never);

  it('looks only at this event’s reservations still holding or awaiting units', async () => {
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

  it('marks them RELEASED, with when', async () => {
    await run();

    expect(tx.equipmentReservation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['res-1'] } },
      data: { status: ReservationStatus.RELEASED, releasedAt: expect.any(Date) },
    });
  });

  it('reports what was released, for the Coordinator to see', async () => {
    await expect(run()).resolves.toEqual([
      {
        reservationId: 'res-1',
        equipmentType: 'Projector',
        quantity: 5,
        previousStatus: ReservationStatus.APPROVED,
      },
    ]);
  });

  it('releases every reservation of the event', async () => {
    tx.equipmentReservation.findMany.mockResolvedValue([
      held(),
      held({ id: 'res-2', status: ReservationStatus.REQUESTED, equipment: { type: 'Microphone' } }),
    ]);

    const released = await run();

    expect(released.map((r) => r.reservationId)).toEqual(['res-1', 'res-2']);
    expect(tx.equipmentReservation.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: ['res-1', 'res-2'] },
    });
  });

  it('writes nothing when there is nothing to release', async () => {
    tx.equipmentReservation.findMany.mockResolvedValue([]);

    await expect(run()).resolves.toEqual([]);
    expect(tx.equipmentReservation.updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op the second time, because released reservations are not selected again', async () => {
    await run();
    tx.equipmentReservation.findMany.mockResolvedValue([]);

    await expect(run()).resolves.toEqual([]);
  });
});
