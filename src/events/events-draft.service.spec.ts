import { BadRequestException, ConflictException } from '@nestjs/common';
import { EventStatus, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { DraftEventRequestDto } from './dto/draft-event-request.dto';
import { BookingsService } from '../bookings/bookings.service';

/** US-04 — drafts. */
describe('EventsService drafts (US-04)', () => {
  let prisma: {
    eventRequest: { create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: {
    requireScope: jest.Mock;
    scopedEventFilter: jest.Mock;
    assertEventAccess: jest.Mock;
    projectEvent: jest.Mock;
  };
  let notifications: { notify: jest.Mock; notifySafely: jest.Mock };
  let service: EventsService;

  const organiser: AuthenticatedUser = {
    userId: 'organiser-1',
    role: Role.EVENT_ORGANISER,
    jti: 'jti-1',
  };

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    organiserId: 'organiser-1',
    coordinatorId: null,
    status: EventStatus.DRAFT,
    name: null,
    purpose: null,
    description: null,
    category: null,
    proposedStart: null,
    proposedEnd: null,
    expectedAttendance: null,
    ...overrides,
  });

  const completeDraft = () =>
    row({
      name: 'Orientation',
      purpose: 'Welcome students',
      description: 'Full day',
      category: 'Student engagement',
      proposedStart: new Date('2030-10-01T09:00:00Z'),
      proposedEnd: new Date('2030-10-01T17:00:00Z'),
      expectedAttendance: 300,
    });

  beforeEach(() => {
    prisma = {
      eventRequest: {
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(row(data)),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      requireScope: jest.fn().mockReturnValue(Scope.OWN),
      scopedEventFilter: jest.fn().mockReturnValue({ organiserId: 'organiser-1' }),
      assertEventAccess: jest.fn(),
      projectEvent: jest.fn((_u, e) => e),
    };
    notifications = { notify: jest.fn(), notifySafely: jest.fn() };
    service = new EventsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
      { releaseForCancelledEvent: jest.fn() } as unknown as EquipmentReservationsService,
      { releaseForCancelledEvent: jest.fn().mockResolvedValue([]) } as unknown as BookingsService,
    );
  });

  describe('AC-1: saving an incomplete draft', () => {
    it('saves with no fields at all, at status DRAFT', async () => {
      const result = await service.saveDraft(organiser, {} as DraftEventRequestDto);

      expect(result.status).toBe(EventStatus.DRAFT);
      expect(prisma.eventRequest.create).toHaveBeenCalled();
    });

    it('never writes status on create — DRAFT is the schema default', async () => {
      await service.saveDraft(organiser, {} as DraftEventRequestDto);

      expect(prisma.eventRequest.create.mock.calls[0][0].data).not.toHaveProperty('status');
    });

    it('saves a partially filled draft without demanding the rest', async () => {
      await service.saveDraft(organiser, {
        name: 'Half-finished',
      } as DraftEventRequestDto);

      const data = prisma.eventRequest.create.mock.calls[0][0].data;
      expect(data.name).toBe('Half-finished');
      expect(data).not.toHaveProperty('purpose');
    });

    it('records the draft against the calling organiser', async () => {
      await service.saveDraft(organiser, {} as DraftEventRequestDto);

      expect(prisma.eventRequest.create.mock.calls[0][0].data.organiserId).toBe(
        'organiser-1',
      );
    });

    it('checks the create grant before writing', async () => {
      await service.saveDraft(organiser, {} as DraftEventRequestDto);

      expect(access.requireScope).toHaveBeenCalledWith(
        organiser,
        Resource.EVENT,
        Action.CREATE,
      );
    });
  });

  describe('AC-2: returning to continue editing', () => {
    it('enforces ownership through the UPDATE grant', async () => {
      access.assertEventAccess.mockResolvedValue(row());

      await service.updateDraft(organiser, 'event-1', {
        purpose: 'Now filled in',
      } as DraftEventRequestDto);

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        organiser,
        'event-1',
        Action.UPDATE,
      );
    });

    it('writes only the fields supplied, leaving others untouched', async () => {
      access.assertEventAccess.mockResolvedValue(row({ name: 'Existing name' }));

      await service.updateDraft(organiser, 'event-1', {
        purpose: 'Added later',
      } as DraftEventRequestDto);

      const data = prisma.eventRequest.update.mock.calls[0][0].data;
      expect(data).toEqual({ purpose: 'Added later' });
      expect(data).not.toHaveProperty('name');
    });

    it('allows an empty edit without clearing anything', async () => {
      access.assertEventAccess.mockResolvedValue(row({ name: 'Existing' }));

      await service.updateDraft(organiser, 'event-1', {} as DraftEventRequestDto);

      expect(prisma.eventRequest.update.mock.calls[0][0].data).toEqual({});
    });
  });

  describe('AC-4: completing and submitting a draft', () => {
    it('transitions DRAFT -> SUBMITTED via setStatus', async () => {
      access.assertEventAccess.mockResolvedValue(completeDraft());

      const result = await service.submitDraft(organiser, 'event-1');

      expect(prisma.eventRequest.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { status: EventStatus.SUBMITTED, submittedAt: expect.any(Date) },
      });
      expect(result.status).toBe(EventStatus.SUBMITTED);
    });

    it('blocks submission of an incomplete draft', async () => {
      access.assertEventAccess.mockResolvedValue(row());

      await expect(service.submitDraft(organiser, 'event-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it('reports every missing field at once, not just the first', async () => {
      access.assertEventAccess.mockResolvedValue(row());

      const error = await service
        .submitDraft(organiser, 'event-1')
        .catch((e: BadRequestException) => e);

      const messages = (
        (error as BadRequestException).getResponse() as { message: string[] }
      ).message.join(' | ');

      expect(messages).toMatch(/name/);
      expect(messages).toMatch(/purpose/);
      expect(messages).toMatch(/category/);
      expect(messages).toMatch(/expectedAttendance/);
    });

    it('applies the submission date rule to a stale draft', async () => {
      access.assertEventAccess.mockResolvedValue({
        ...completeDraft(),
        proposedStart: new Date('2020-01-01T09:00:00Z'),
        proposedEnd: new Date('2020-01-01T17:00:00Z'),
      });

      await expect(service.submitDraft(organiser, 'event-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('uses the SUBMIT grant, not UPDATE', async () => {
      access.assertEventAccess.mockResolvedValue(completeDraft());

      await service.submitDraft(organiser, 'event-1');

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        organiser,
        'event-1',
        Action.SUBMIT,
      );
    });
  });

  describe('AC-5: a submitted request is not a draft', () => {
    it('refuses to edit a SUBMITTED request', async () => {
      access.assertEventAccess.mockResolvedValue(
        row({ status: EventStatus.SUBMITTED }),
      );

      await expect(
        service.updateDraft(organiser, 'event-1', {
          name: 'Sneaky edit',
        } as DraftEventRequestDto),
      ).rejects.toThrow(ConflictException);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it('refuses to re-submit a SUBMITTED request', async () => {
      access.assertEventAccess.mockResolvedValue(
        row({ status: EventStatus.SUBMITTED }),
      );

      await expect(service.submitDraft(organiser, 'event-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to edit an APPROVED request', async () => {
      access.assertEventAccess.mockResolvedValue(
        row({ status: EventStatus.APPROVED }),
      );

      await expect(
        service.updateDraft(organiser, 'event-1', {} as DraftEventRequestDto),
      ).rejects.toThrow(ConflictException);
    });

    it('names the current status when refusing', async () => {
      access.assertEventAccess.mockResolvedValue(
        row({ status: EventStatus.UNDER_REVIEW }),
      );

      await expect(
        service.updateDraft(organiser, 'event-1', {} as DraftEventRequestDto),
      ).rejects.toThrow(/UNDER_REVIEW/);
    });
  });
});
