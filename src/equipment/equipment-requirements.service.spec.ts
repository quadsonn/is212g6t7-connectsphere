import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventStatus, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import {
  EquipmentRequirementsService,
  NO_REQUIREMENTS_MESSAGE,
  recordedText,
  toRequirementsView,
} from './equipment-requirements.service';

/** US-31 — viewing an event's equipment and technical requirements. */
describe('EquipmentRequirementsService (US-31)', () => {
  const tech: AuthenticatedUser = {
    userId: 'tech-1',
    role: Role.TECHNICAL_SUPPORT_STAFF,
    jti: 'j1',
  };

  const event = {
    id: 'event-1',
    name: 'Capstone Showcase',
    status: EventStatus.PLANNING,
    proposedStart: new Date('2030-10-01T09:00:00.000Z'),
    proposedEnd: new Date('2030-10-01T17:00:00.000Z'),
    equipmentNeeds: 'Six wireless microphones, two projectors.',
  };

  let prisma: { eventRequest: { findMany: jest.Mock; findFirst: jest.Mock } };
  let access: { requireScope: jest.Mock };
  let service: EquipmentRequirementsService;

  beforeEach(() => {
    prisma = {
      eventRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    access = { requireScope: jest.fn().mockReturnValue(Scope.ANY) };
    service = new EquipmentRequirementsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
    );
  });

  describe('US-31 AC-1/AC-2: what was requested is shown, not just that a request exists', () => {
    it('returns the Organiser’s equipment needs text in full', () => {
      expect(toRequirementsView(event)).toEqual({
        eventId: 'event-1',
        name: 'Capstone Showcase',
        status: EventStatus.PLANNING,
        proposedStart: event.proposedStart,
        proposedEnd: event.proposedEnd,
        organiserEquipmentNeeds: 'Six wireless microphones, two projectors.',
        hasRequirements: true,
        message: null,
      });
    });

    it('returns one event’s requirements by id', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(event);

      await expect(service.findForEvent(tech, 'event-1')).resolves.toMatchObject({
        organiserEquipmentNeeds: 'Six wireless microphones, two projectors.',
      });
    });

    it('trims surrounding whitespace but keeps the text otherwise intact', () => {
      expect(recordedText('  2 mics\n1 projector  ')).toBe('2 mics\n1 projector');
    });
  });

  describe('US-31 AC-3: no requirements recorded is clearly indicated', () => {
    it.each([
      ['null', null],
      ['empty', ''],
      ['whitespace-only', '   \n '],
    ])('treats %s equipment needs as nothing recorded', (_label, equipmentNeeds) => {
      expect(toRequirementsView({ ...event, equipmentNeeds })).toMatchObject({
        organiserEquipmentNeeds: null,
        hasRequirements: false,
        message: NO_REQUIREMENTS_MESSAGE,
      });
    });
  });

  describe('US-31 AC-4: only submitted events that have requirements; never drafts', () => {
    it('lists only non-draft events with recorded equipment needs', async () => {
      await service.findEventsWithRequirements(tech);

      const { where } = prisma.eventRequest.findMany.mock.calls[0][0];
      expect(where.status.in).not.toContain(EventStatus.DRAFT);
      expect(where.status.in).toEqual(
        expect.arrayContaining([EventStatus.SUBMITTED, EventStatus.PLANNING]),
      );
      expect(where.equipmentNeeds).toEqual({ not: null });
      expect(where.NOT).toEqual({ equipmentNeeds: '' });
    });

    it('drops events whose text is whitespace-only', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        event,
        { ...event, id: 'event-2', equipmentNeeds: '   ' },
      ]);

      const views = await service.findEventsWithRequirements(tech);

      expect(views.map((view) => view.eventId)).toEqual(['event-1']);
    });

    it('looks up a single event only among non-draft statuses', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(event);

      await service.findForEvent(tech, 'event-1');

      const { where } = prisma.eventRequest.findFirst.mock.calls[0][0];
      expect(where.id).toBe('event-1');
      expect(where.status.in).not.toContain(EventStatus.DRAFT);
    });

    it('404s for a draft or unknown event rather than revealing it', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(null);

      await expect(service.findForEvent(tech, 'draft-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('is refused to a role without the grant', async () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(service.findEventsWithRequirements(tech)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.eventRequest.findMany).not.toHaveBeenCalled();
    });
  });
});
