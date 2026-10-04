import { AccessibilityFeature, EventStatus, Role, RoomLayout } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { CreateEventRequestDto } from './dto/create-event-request.dto';
import { DraftEventRequestDto } from './dto/draft-event-request.dto';

/** US-06 — capturing layout and accessibility preferences. */
describe('EventsService layout & accessibility (US-06)', () => {
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
    status: EventStatus.DRAFT,
    preferredLayout: null,
    layoutNotes: null,
    accessibilityRequirements: [],
    accessibilityNotes: null,
    ...overrides,
  });

  const submission = (overrides: Partial<CreateEventRequestDto> = {}) =>
    ({
      name: 'Orientation',
      purpose: 'Welcome students',
      description: 'Full day',
      category: 'Student engagement',
      proposedStart: new Date('2030-10-01T09:00:00Z'),
      proposedEnd: new Date('2030-10-01T17:00:00Z'),
      expectedAttendance: 300,
      ...overrides,
    }) as CreateEventRequestDto;

  beforeEach(() => {
    prisma = {
      eventRequest: {
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(row(data))),
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
    );
  });

  describe('AC-1 / AC-2: layout selection and notes', () => {
    it('persists a selected layout on submission', async () => {
      await service.createAndSubmit(
        organiser,
        submission({ preferredLayout: RoomLayout.BANQUET }),
      );

      expect(prisma.eventRequest.create.mock.calls[0][0].data.preferredLayout).toBe(
        RoomLayout.BANQUET,
      );
    });

    it('persists free-text notes alongside the selection', async () => {
      await service.createAndSubmit(
        organiser,
        submission({
          preferredLayout: RoomLayout.THEATRE,
          layoutNotes: 'Raised platform needed at the front',
        }),
      );

      const data = prisma.eventRequest.create.mock.calls[0][0].data;
      expect(data.preferredLayout).toBe(RoomLayout.THEATRE);
      expect(data.layoutNotes).toBe('Raised platform needed at the front');
    });

    it('accepts notes with no layout selected, for a layout not on the list', async () => {
      await service.createAndSubmit(
        organiser,
        submission({ layoutNotes: 'Cabaret style, eight to a table' }),
      );

      const data = prisma.eventRequest.create.mock.calls[0][0].data;
      expect(data.preferredLayout).toBeNull();
      expect(data.layoutNotes).toBe('Cabaret style, eight to a table');
    });
  });

  describe('AC-3: accessibility requirements', () => {
    it('persists multiple requirements', async () => {
      await service.createAndSubmit(
        organiser,
        submission({
          accessibilityRequirements: [
            AccessibilityFeature.STEP_FREE_ACCESS,
            AccessibilityFeature.HEARING_LOOP,
          ],
        }),
      );

      expect(
        prisma.eventRequest.create.mock.calls[0][0].data.accessibilityRequirements,
      ).toEqual([
        AccessibilityFeature.STEP_FREE_ACCESS,
        AccessibilityFeature.HEARING_LOOP,
      ]);
    });

    it('persists accessibility notes alongside the selections', async () => {
      await service.createAndSubmit(
        organiser,
        submission({
          accessibilityRequirements: [AccessibilityFeature.ACCESSIBLE_RESTROOMS],
          accessibilityNotes: 'Nearest accessible restroom must be on the same floor',
        }),
      );

      const data = prisma.eventRequest.create.mock.calls[0][0].data;
      expect(data.accessibilityRequirements).toEqual([
        AccessibilityFeature.ACCESSIBLE_RESTROOMS,
      ]);
      expect(data.accessibilityNotes).toMatch(/same floor/);
    });

    it('accepts every feature in the extended list, not just the original three', async () => {
      const all = Object.values(AccessibilityFeature);
      expect(all).toEqual([
        AccessibilityFeature.STEP_FREE_ACCESS,
        AccessibilityFeature.WHEELCHAIR_ACCESSIBLE_LIFT,
        AccessibilityFeature.ACCESSIBLE_PARKING,
        AccessibilityFeature.ACCESSIBLE_RESTROOMS,
        AccessibilityFeature.WHEELCHAIR_SEATING,
        AccessibilityFeature.HEARING_LOOP,
        AccessibilityFeature.NURSING_ROOM,
      ]);

      await service.createAndSubmit(
        organiser,
        submission({ accessibilityRequirements: all }),
      );

      expect(
        prisma.eventRequest.create.mock.calls[0][0].data.accessibilityRequirements,
      ).toEqual(all);
    });
  });

  describe('AC-4: values persist on a draft too', () => {
    it('saves layout and accessibility on a draft', async () => {
      await service.saveDraft(organiser, {
        preferredLayout: RoomLayout.CLASSROOM,
        layoutNotes: 'Rows of six',
        accessibilityRequirements: [AccessibilityFeature.HEARING_LOOP],
        accessibilityNotes: 'Loop must cover the back row',
      } as DraftEventRequestDto);

      const data = prisma.eventRequest.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        preferredLayout: RoomLayout.CLASSROOM,
        layoutNotes: 'Rows of six',
        accessibilityRequirements: [AccessibilityFeature.HEARING_LOOP],
        accessibilityNotes: 'Loop must cover the back row',
      });
    });

    it('updates them on an existing draft', async () => {
      access.assertEventAccess.mockResolvedValue(row());

      await service.updateDraft(organiser, 'event-1', {
        preferredLayout: RoomLayout.BOARDROOM,
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
      } as DraftEventRequestDto);

      expect(prisma.eventRequest.update.mock.calls[0][0].data).toEqual({
        preferredLayout: RoomLayout.BOARDROOM,
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
      });
    });

    it('leaves layout untouched when an edit does not mention it', async () => {
      access.assertEventAccess.mockResolvedValue(
        row({ preferredLayout: RoomLayout.THEATRE }),
      );

      await service.updateDraft(organiser, 'event-1', {
        purpose: 'Updated purpose',
      } as DraftEventRequestDto);

      expect(prisma.eventRequest.update.mock.calls[0][0].data).not.toHaveProperty(
        'preferredLayout',
      );
    });
  });

  describe('AC-5: these are preferences, not blockers', () => {
    it('submits with no layout or accessibility at all', async () => {
      const result = await service.createAndSubmit(organiser, submission());

      expect(result).toBeDefined();
      const data = prisma.eventRequest.create.mock.calls[0][0].data;
      expect(data.preferredLayout).toBeNull();
      expect(data.accessibilityRequirements).toEqual([]);
      expect(data.accessibilityNotes).toBeNull();
    });

    it('does not block submitting a completed draft that omits them', async () => {
      access.assertEventAccess.mockResolvedValue(
        row({
          name: 'Orientation',
          purpose: 'Welcome',
          description: 'Full day',
          category: 'Student engagement',
          proposedStart: new Date('2030-10-01T09:00:00Z'),
          proposedEnd: new Date('2030-10-01T17:00:00Z'),
          expectedAttendance: 300,
        }),
      );

      await expect(service.submitDraft(organiser, 'event-1')).resolves.toMatchObject({
        status: EventStatus.SUBMITTED,
      });
    });

    it('defaults accessibility requirements to an empty array, never null', async () => {
      await service.createAndSubmit(organiser, submission());

      expect(
        prisma.eventRequest.create.mock.calls[0][0].data.accessibilityRequirements,
      ).toEqual([]);
    });
  });
});
