import { EquipmentStatus, NotificationType, Role } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EquipmentStatusNotifier } from './equipment-status-notifier';

/** US-60 — who hears that an item was taken out of use, and what they are told. */
describe('EquipmentStatusNotifier (US-60)', () => {
  const staff = [{ id: 'USR-002' }, { id: 'USR-003' }];
  let prisma: {
    equipment: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock; findMany: jest.Mock };
  };
  let notifications: { notifySafely: jest.Mock };
  let notifier: EquipmentStatusNotifier;

  beforeEach(() => {
    prisma = {
      equipment: { findUnique: jest.fn().mockResolvedValue({ type: 'Projector' }) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Wei Technical' }),
        findMany: jest.fn().mockResolvedValue(staff),
      },
    };
    notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };
    notifier = new EquipmentStatusNotifier(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  const change = (toStatus: EquipmentStatus) =>
    notifier.statusChanged({
      equipmentId: 'EQP-001',
      toStatus,
      reason: 'Cracked lens',
      actorId: 'USR-001',
    });

  it('US-60 AC-1: every other Technical Support member is told the item name and new status', async () => {
    const sent = await change(EquipmentStatus.OUT_OF_SERVICE);

    expect(sent).toBe(2);
    expect(notifications.notifySafely.mock.calls.map(([input]) => input)).toEqual(
      staff.map(({ id }) => ({
        recipientId: id,
        type: NotificationType.EQUIPMENT_STATUS_CHANGED,
        message: 'Projector marked Damaged by Wei Technical. Reason: Cracked lens',
        relatedEquipmentId: 'EQP-001',
      })),
    );
  });

  it('US-60 AC-1: Under Maintenance is announced with its own label', async () => {
    await change(EquipmentStatus.UNDER_MAINTENANCE);

    expect(notifications.notifySafely.mock.calls[0][0].message).toMatch(/^Projector marked Under Maintenance/);
  });

  it('US-60 AC-2: the recipients are looked up without the actor, by role', async () => {
    await change(EquipmentStatus.OUT_OF_SERVICE);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: Role.TECHNICAL_SUPPORT_STAFF, id: { not: 'USR-001' } },
      }),
    );
  });

  it('US-60 AC-3: needs no event or assignment — nothing about events is read', async () => {
    await change(EquipmentStatus.OUT_OF_SERVICE);

    expect(Object.keys(prisma)).toEqual(['equipment', 'user']);
    expect(notifications.notifySafely.mock.calls[0][0]).not.toHaveProperty('relatedEventId');
  });

  it('US-60: an item returning to Available tells no one', async () => {
    expect(await change(EquipmentStatus.OPERATIONAL)).toBe(0);
    expect(notifications.notifySafely).not.toHaveBeenCalled();
  });

  it('US-60: with no other Technical Support member, nobody is notified', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    expect(await change(EquipmentStatus.OUT_OF_SERVICE)).toBe(0);
    expect(notifications.notifySafely).not.toHaveBeenCalled();
  });

  // TC-S4-73 · US-60 AC-1 · setup: none (unit) · fails if a vanished item is announced, or an actor whose name cannot be read breaks the notice
  // Code: EquipmentStatusNotifier.statusChanged (item gone: nothing; actor name fallback)
  it('US-60: says nothing for an item that has gone, and names an unknown actor "a colleague"', async () => {
    prisma.equipment.findUnique.mockResolvedValueOnce(null);
    expect(await change(EquipmentStatus.OUT_OF_SERVICE)).toBe(0);
    expect(notifications.notifySafely).not.toHaveBeenCalled();

    prisma.user.findUnique.mockResolvedValue(null);
    await change(EquipmentStatus.OUT_OF_SERVICE);
    expect(notifications.notifySafely.mock.calls[0][0].message).toBe(
      'Projector marked Damaged by a colleague. Reason: Cracked lens',
    );
  });
});
