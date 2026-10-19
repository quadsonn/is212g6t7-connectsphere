import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventStatus, Role, RoomLayout } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import {
  EquipmentRequirementsService,
  hasAnySource,
  NO_REQUIREMENTS_MESSAGE,
  recordedText,
  REQUIREMENTS_VISIBLE_WHERE,
  toRequirementsView,
} from './equipment-requirements.service';

/** US-31 — viewing an event's equipment and technical requirements. */
describe('EquipmentRequirementsService (US-31)', () => {
  const tech: AuthenticatedUser = {
    userId: 'tech-1',
    role: Role.TECHNICAL_SUPPORT_STAFF,
    jti: 'j1',
  };

  const row = {
    id: 'req-1',
    // Read so rows can be listed in the order they were entered.
    createdAt: new Date('2030-09-01T00:00:00.000Z'),
    equipmentType: 'Wireless microphone',
    quantity: 6,
    notes: 'Lapel',
  };

  /** An event with no requirement source; each test adds the ones it needs. */
  const bare = {
    id: 'event-1',
    name: 'Capstone Showcase',
    description: 'Final-year project showcase.',
    status: EventStatus.PLANNING as EventStatus,
    proposedStart: new Date('2030-10-01T09:00:00.000Z'),
    proposedEnd: new Date('2030-10-01T17:00:00.000Z'),
    equipmentNeeds: null as string | null,
    technicalSupportNeeds: null as string | null,
    equipmentRequirements: [] as (typeof row)[],
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

  describe('US-31 AC-1/AC-2: recorded requirements are shown, including what was requested', () => {
    it('Organiser text only — returned in full', () => {
      expect(toRequirementsView({ ...bare, equipmentNeeds: 'Six mics, two projectors.' })).toEqual({
        eventId: 'event-1',
        name: 'Capstone Showcase',
        description: 'Final-year project showcase.',
        status: EventStatus.PLANNING,
        proposedStart: bare.proposedStart,
        proposedEnd: bare.proposedEnd,
        organiserEquipmentNeeds: 'Six mics, two projectors.',
        coordinatorRequirements: [],
        technicalSupportNeeds: null,
        hasRequirements: true,
        message: null,
      });
    });

    it('Coordinator rows only — type, quantity and notes per line', () => {
      const view = toRequirementsView({ ...bare, equipmentRequirements: [row] });

      // createdAt is read only to order the rows; the view does not carry it.
      const { createdAt: _createdAt, ...shown } = row;
      expect(view.coordinatorRequirements).toEqual([shown]);
      expect(view).toMatchObject({ organiserEquipmentNeeds: null, hasRequirements: true });
    });

    it('technical support notes only — returned in full', () => {
      const view = toRequirementsView({
        ...bare,
        technicalSupportNeeds: 'On-site AV technician all day.',
      });

      expect(view).toMatchObject({
        technicalSupportNeeds: 'On-site AV technician all day.',
        hasRequirements: true,
        message: null,
      });
    });

    it('all three together', () => {
      const view = toRequirementsView({
        ...bare,
        equipmentNeeds: 'Six mics.',
        technicalSupportNeeds: 'Technician on call.',
        equipmentRequirements: [row, { ...row, id: 'req-2', equipmentType: 'PA system', quantity: 1, notes: null }],
      });

      expect(view).toMatchObject({
        organiserEquipmentNeeds: 'Six mics.',
        technicalSupportNeeds: 'Technician on call.',
        hasRequirements: true,
      });
      expect(view.coordinatorRequirements.map((r) => r.equipmentType)).toEqual([
        'Wireless microphone',
        'PA system',
      ]);
    });

    it('includes the event description for the page header', () => {
      expect(toRequirementsView({ ...bare, equipmentNeeds: 'x' }).description).toBe(
        'Final-year project showcase.',
      );
    });

    it('trims text but keeps it otherwise intact; blank row notes become null', () => {
      expect(recordedText('  2 mics\n1 projector  ')).toBe('2 mics\n1 projector');
      expect(
        toRequirementsView({ ...bare, equipmentRequirements: [{ ...row, notes: '  ' }] })
          .coordinatorRequirements[0].notes,
      ).toBeNull();
    });
  });

  describe('US-31 AC-3: none of the three recorded is clearly indicated', () => {
    it.each([
      ['all null', null, null],
      ['all empty', '', ''],
      ['whitespace-only text', '   ', '\n '],
    ])('%s → hasRequirements false with the message', (_label, equipmentNeeds, technicalSupportNeeds) => {
      expect(toRequirementsView({ ...bare, equipmentNeeds, technicalSupportNeeds })).toMatchObject({
        organiserEquipmentNeeds: null,
        coordinatorRequirements: [],
        technicalSupportNeeds: null,
        hasRequirements: false,
        message: NO_REQUIREMENTS_MESSAGE,
      });
    });

    it('a submitted event with none is still returned by id, with the message', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(bare);

      await expect(service.findForEvent(tech, 'event-1')).resolves.toMatchObject({
        hasRequirements: false,
        message: NO_REQUIREMENTS_MESSAGE,
      });
    });
  });

  describe('US-31 AC-4: only submitted events with a requirement source; drafts hidden', () => {
    it('the visibility rule excludes drafts and needs at least one of the three sources', () => {
      const where = REQUIREMENTS_VISIBLE_WHERE as { status: { in: EventStatus[] }; OR: unknown[] };

      expect(where.status.in).not.toContain(EventStatus.DRAFT);
      expect(where.status.in).toEqual(
        expect.arrayContaining([EventStatus.SUBMITTED, EventStatus.PLANNING]),
      );
      expect(where.OR).toEqual([
        { AND: [{ equipmentNeeds: { not: null } }, { NOT: { equipmentNeeds: '' } }] },
        { equipmentRequirements: { some: {} } },
        {
          AND: [{ technicalSupportNeeds: { not: null } }, { NOT: { technicalSupportNeeds: '' } }],
        },
      ]);
    });

    it('the list uses that rule', async () => {
      await service.findEventsWithRequirements(tech);

      expect(prisma.eventRequest.findMany.mock.calls[0][0].where).toBe(REQUIREMENTS_VISIBLE_WHERE);
    });

    it('the list drops events whose only text is whitespace', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        { ...bare, equipmentNeeds: 'Six mics.' },
        { ...bare, id: 'event-2', equipmentNeeds: '   ' },
      ]);

      const views = await service.findEventsWithRequirements(tech);

      expect(views.map((v) => v.eventId)).toEqual(['event-1']);
    });

    it('looks up a single event only among non-draft statuses', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue({ ...bare, equipmentNeeds: 'x' });

      await service.findForEvent(tech, 'event-1');

      const { where } = prisma.eventRequest.findFirst.mock.calls[0][0];
      expect(where.id).toBe('event-1');
      expect(where.status.in).not.toContain(EventStatus.DRAFT);
    });

    it('404s for a draft or unknown event rather than revealing it', async () => {
      await expect(service.findForEvent(tech, 'draft-1')).rejects.toThrow(NotFoundException);
    });

    it('is refused to a role without the grant, before any query', async () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(service.findEventsWithRequirements(tech)).rejects.toThrow(ForbiddenException);
      await expect(service.findDetailsForEvent(tech, 'event-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.eventRequest.findMany).not.toHaveBeenCalled();
      expect(prisma.eventRequest.findFirst).not.toHaveBeenCalled();
    });

    it.each([
      ['Organiser text', { equipmentNeeds: 'x', technicalSupportNeeds: null, requirementCount: 0 }, true],
      ['a Coordinator row', { equipmentNeeds: null, technicalSupportNeeds: null, requirementCount: 1 }, true],
      ['notes', { equipmentNeeds: null, technicalSupportNeeds: 'x', requirementCount: 0 }, true],
      ['nothing', { equipmentNeeds: ' ', technicalSupportNeeds: '', requirementCount: 0 }, false],
    ])('hasAnySource with %s → %s', (_label, input, expected) => {
      expect(hasAnySource(input)).toBe(expected);
    });
  });

  describe('US-31 AC-4: "View more details" opens any submitted event; drafts hidden', () => {
    const detailsRow = {
      id: 'event-1',
      name: 'Capstone Showcase',
      description: 'Final-year project showcase.',
      status: EventStatus.PLANNING,
      proposedStart: bare.proposedStart,
      proposedEnd: bare.proposedEnd,
      expectedAttendance: 250,
      preferredLayout: RoomLayout.THEATRE,
      layoutNotes: 'Stage at the front',
      accessibilityRequirements: ['STEP_FREE_ACCESS'],
      accessibilityNotes: null,
      programme: '09:00 Welcome',
      coordinator: { name: 'Casey', email: 'casey@example.com' },
    };

    it('returns the full event details', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(detailsRow);

      await expect(service.findDetailsForEvent(tech, 'event-1')).resolves.toEqual({
        eventId: 'event-1',
        name: 'Capstone Showcase',
        description: 'Final-year project showcase.',
        status: EventStatus.PLANNING,
        proposedStart: bare.proposedStart,
        proposedEnd: bare.proposedEnd,
        expectedAttendance: 250,
        preferredLayout: RoomLayout.THEATRE,
        layoutNotes: 'Stage at the front',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        accessibilityNotes: null,
        programme: '09:00 Welcome',
        coordinator: { name: 'Casey', email: 'casey@example.com' },
      });
    });

    it('looks up only non-draft events, without requiring a requirement source', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(detailsRow);

      await service.findDetailsForEvent(tech, 'event-1');

      const { where } = prisma.eventRequest.findFirst.mock.calls[0][0];
      expect(where.id).toBe('event-1');
      expect(where.status.in).not.toContain(EventStatus.DRAFT);
      expect(where).not.toHaveProperty('OR');
    });

    it('404s for a draft or unknown event', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(null);

      await expect(service.findDetailsForEvent(tech, 'draft-1')).rejects.toThrow(NotFoundException);
    });
  });
});
