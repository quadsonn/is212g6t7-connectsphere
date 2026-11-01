import { EventStatus, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { BookingsService } from '../bookings/bookings.service';

/** US-05 — the Organiser's read-only status view. */
describe('EventsService status view (US-05)', () => {
  let prisma: {
    eventRequest: {
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    eventChangeRequest: { findFirst: jest.Mock };
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
    name: 'Orientation',
    status: EventStatus.SUBMITTED,
    decisionReason: null,
    clarificationRequest: null,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      eventRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        // findMyRequest re-reads to attach the US-09 clarification thread.
        findUniqueOrThrow: jest.fn().mockResolvedValue(row()),
        create: jest.fn(),
        update: jest.fn(),
      },
      // US-36: the Organiser's single-event view looks for a pending change request.
      eventChangeRequest: { findFirst: jest.fn().mockResolvedValue(null) },
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
      { releaseForCancelledEvent: jest.fn(), findUnavailableForEvent: jest.fn().mockResolvedValue([]) } as unknown as EquipmentReservationsService,
      { releaseForCancelledEvent: jest.fn().mockResolvedValue([]) } as unknown as BookingsService,
    );
  });

  // TC-S1-39 · US-05 AC-1 · unit: findMyRequests()/toOrganiserView() with Prisma mocked · fails if a
  // status is reported as something else
  describe('AC-1: every status is reported', () => {
    // One row per distinct status-view outcome: no decision, a rejection with
    // its reason, a return with its reason, and a terminal status. That every
    // status reaches the Organiser is proven against the DB by
    // test/events-status-view.e2e-spec.ts "reports every status in the lifecycle".
    it.each([
      {
        status: EventStatus.SUBMITTED,
        fields: {},
        expected: { isTerminal: false, decision: null, clarificationRequested: false },
      },
      {
        status: EventStatus.REJECTED,
        fields: { decisionReason: 'Clashes with exam week' },
        expected: {
          isTerminal: false,
          decision: { outcome: EventStatus.REJECTED, reason: 'Clashes with exam week' },
          clarificationRequested: false,
        },
      },
      {
        status: EventStatus.RETURNED,
        fields: { clarificationRequest: 'Please shorten the programme' },
        expected: {
          isTerminal: false,
          decision: { outcome: EventStatus.RETURNED, reason: 'Please shorten the programme' },
          clarificationRequested: true,
        },
      },
      {
        status: EventStatus.CANCELLED,
        fields: {},
        expected: { isTerminal: true, decision: null, clarificationRequested: false },
      },
    ])('reports $status with its status view', async ({ status, fields, expected }) => {
      prisma.eventRequest.findMany.mockResolvedValue([row({ status, ...fields })]);

      const [view] = await service.findMyRequests(organiser);

      expect(view.status).toBe(status);
      expect(view.statusView).toEqual({ status, ...expected });
    });

    it('returns the status for each request in the list', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        row({ id: 'a', status: EventStatus.DRAFT }),
        row({ id: 'b', status: EventStatus.APPROVED }),
      ]);

      const views = await service.findMyRequests(organiser);

      expect(views.map((v) => v.status)).toEqual([
        EventStatus.DRAFT,
        EventStatus.APPROVED,
      ]);
    });
  });

  // TC-S1-41 · US-05 AC-2 · unit · fails if a REJECTED request's view drops the Coordinator's reason
  describe('AC-2: a rejected request shows the reason', () => {
    it('surfaces decisionReason', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        row({
          status: EventStatus.REJECTED,
          decisionReason: 'Clashes with the examination period',
        }),
      ]);

      const [view] = await service.findMyRequests(organiser);

      expect(view.status).toBe(EventStatus.REJECTED);
      expect(view.decisionReason).toBe('Clashes with the examination period');
    });

    it('leaves the reason null when there is none', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        row({ status: EventStatus.APPROVED }),
      ]);

      const [view] = await service.findMyRequests(organiser);

      expect(view.decisionReason).toBeNull();
    });
  });

  // TC-S1-42, TC-S1-43 · US-05 AC-3 · unit · fails if the question is missing when asked, or shown
  // when not
  describe('AC-3: clarification is visible, with the question asked', () => {
    it('flags clarification and shows what is being asked', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        row({
          status: EventStatus.DRAFT,
          clarificationRequest: 'Please confirm the expected attendance figure',
        }),
      ]);

      const [view] = await service.findMyRequests(organiser);

      expect(view.clarificationRequested).toBe(true);
      expect(view.clarificationRequest).toMatch(/expected attendance/);
    });

    it('distinguishes a clarification draft from an ordinary draft', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        row({ id: 'plain', status: EventStatus.DRAFT }),
        row({
          id: 'returned',
          status: EventStatus.DRAFT,
          clarificationRequest: 'Which venue did you have in mind?',
        }),
      ]);

      const [plain, returned] = await service.findMyRequests(organiser);

      // Both are DRAFT; only one is awaiting an answer.
      expect(plain.status).toBe(returned.status);
      expect(plain.clarificationRequested).toBe(false);
      expect(returned.clarificationRequested).toBe(true);
    });

    it('derives the flag rather than trusting a stored value', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        // A stale/incorrect stored flag would be ignored — it is computed.
        row({ clarificationRequest: null, clarificationRequested: true }),
      ]);

      const [view] = await service.findMyRequests(organiser);

      expect(view.clarificationRequested).toBe(false);
    });
  });

  // TC-S1-44, TC-S1-45 · US-05 AC-4 · unit · fails if the view is built from anything but the latest
  // stored row
  describe('AC-4: the most recent state is what is shown', () => {
    it('reflects whatever status the record currently holds', async () => {
      prisma.eventRequest.findMany.mockResolvedValueOnce([
        row({ status: EventStatus.SUBMITTED }),
      ]);
      const [before] = await service.findMyRequests(organiser);

      prisma.eventRequest.findMany.mockResolvedValueOnce([
        row({ status: EventStatus.UNDER_REVIEW }),
      ]);
      const [after] = await service.findMyRequests(organiser);

      expect(before.status).toBe(EventStatus.SUBMITTED);
      expect(after.status).toBe(EventStatus.UNDER_REVIEW);
    });

    it('reads fresh rather than serving a cached list', async () => {
      await service.findMyRequests(organiser);
      await service.findMyRequests(organiser);

      expect(prisma.eventRequest.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // TC-S1-46 · US-05 AC-5 · unit · fails if the query is not filtered on organiserId
  describe('AC-5: only the Organiser’s own requests', () => {
    it('scopes the query through the shared access layer', async () => {
      await service.findMyRequests(organiser);

      expect(access.scopedEventFilter).toHaveBeenCalledWith(organiser, Action.READ);
      expect(prisma.eventRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organiserId: 'organiser-1' } }),
      );
    });

    it('enforces ownership when fetching one by id', async () => {
      access.assertEventAccess.mockResolvedValue(row());

      await service.findMyRequest(organiser, 'event-1');

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        organiser,
        'event-1',
        Action.READ,
      );
    });
  });

  // TC-S1-44 · US-05 AC-4, US-11 · unit · fails if viewing a status could change it
  describe('read-only: owns no transition logic', () => {
    it('never writes when listing', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([row()]);

      await service.findMyRequests(organiser);

      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      expect(prisma.eventRequest.create).not.toHaveBeenCalled();
    });

    it('never writes when fetching one', async () => {
      access.assertEventAccess.mockResolvedValue(row());

      await service.findMyRequest(organiser, 'event-1');

      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });
  });
});
