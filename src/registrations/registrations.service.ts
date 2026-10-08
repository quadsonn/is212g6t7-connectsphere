import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  NotificationType,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { ATTENDEE_VISIBLE_STATUSES } from '../events/event-status.machine';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import {
  evaluateRegistration,
  evaluateWithdrawal,
  RegistrationOptions,
  WithdrawOptions,
} from './registration-rules';

type Db = Prisma.TransactionClient | PrismaService;

const EVENT_FACTS_SELECT = {
  id: true,
  name: true,
  status: true,
  registrationEnabled: true,
  proposedStart: true,
  proposedEnd: true,
  expectedAttendance: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  withdrawalCutoffAt: true,
} as const satisfies Prisma.EventRequestSelect;

/**
 * US-35 AC-1/AC-2 — the registration with the event's *current* details,
 * read through the relation on every call rather than copied at registration
 * time, so later changes to the event always show.
 */
const REGISTRATION_VIEW_SELECT = {
  id: true,
  status: true,
  phone: true,
  dietaryRequirements: true,
  accessibilityNeeds: true,
  createdAt: true,
  withdrawnAt: true,
  attendeeId: true,
  event: {
    select: {
      ...EVENT_FACTS_SELECT,
      venueBookings: {
        where: { status: BookingStatus.APPROVED },
        orderBy: { start: 'asc' },
        take: 1,
        select: { venue: { select: { id: true, name: true, location: true } } },
      },
    },
  },
} as const satisfies Prisma.RegistrationSelect;

type RegistrationRow = Prisma.RegistrationGetPayload<{
  select: typeof REGISTRATION_VIEW_SELECT;
}>;

export interface RegistrationView {
  id: string;
  status: RegistrationStatus;
  registeredAt: Date;
  withdrawnAt: Date | null;
  phone: string;
  dietaryRequirements: string | null;
  accessibilityNeeds: string | null;
  event: {
    id: string;
    name: string | null;
    status: string;
    start: Date | null;
    end: Date | null;
    venue: { id: string; name: string | null; location: string | null } | null;
  };
  withdrawal: WithdrawOptions;
}

export type RegistrationOptionsView = RegistrationOptions & {
  eventId: string;
  alreadyRegistered: boolean;
  registeredCount: number;
  capacity: number | null;
};

export const NO_REGISTRATIONS_MESSAGE = 'No Events Registered';

/**
 * E7 — attendee registration (US-34), viewing it (US-35) and withdrawing
 * (US-36).
 *
 * The only writer of Registration.status. Every method re-checks its rules
 * server-side; the `canRegister` / `canWithdraw` flags it returns exist so a
 * client can show or hide options, never as the enforcement.
 */
@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * US-34 AC-1/AC-6/AC-7 — whether the Register option applies to an event,
   * and if not, why (including the open/close times). Also tells the caller
   * whether they already hold a registration (AC-5).
   */
  async getOptions(
    user: AuthenticatedUser,
    eventId: string,
  ): Promise<RegistrationOptionsView> {
    this.access.requireScope(user, Resource.REGISTRATION, Action.REGISTER);

    const event = await this.findVisibleEvent(this.prisma, eventId);
    const [registeredCount, existing] = await Promise.all([
      this.countRegistered(this.prisma, eventId),
      this.prisma.registration.findUnique({
        where: { eventId_attendeeId: { eventId, attendeeId: user.userId } },
        select: { status: true },
      }),
    ]);

    const alreadyRegistered = existing?.status === RegistrationStatus.REGISTERED;
    const options = evaluateRegistration(event, registeredCount, new Date());

    return {
      ...options,
      // AC-5: no Register option once a registration is confirmed.
      canRegister: options.canRegister && !alreadyRegistered,
      reason: alreadyRegistered
        ? 'You are already registered for this event.'
        : options.reason,
      eventId,
      alreadyRegistered,
      registeredCount,
      capacity: event.expectedAttendance,
    };
  }

  /**
   * US-34 AC-3/AC-4/AC-5/AC-6/AC-7 — register the attendee.
   *
   * The event row is locked for the transaction so the capacity check and the
   * insert cannot interleave: without it, two attendees could both read "one
   * place left" and both register. A previously withdrawn registration is
   * re-activated rather than duplicated (the table keeps one row per
   * event/attendee), so re-registering after a withdrawal follows the same
   * rules as a first registration.
   */
  async register(
    user: AuthenticatedUser,
    dto: RegisterDto,
  ): Promise<RegistrationView> {
    this.access.requireScope(user, Resource.REGISTRATION, Action.REGISTER);

    const { registration, event } = await this.prisma.$transaction(
      async (tx) => {
        await this.lockEvent(tx, dto.eventId);
        const event = await this.findVisibleEvent(tx, dto.eventId);

        const existing = await tx.registration.findUnique({
          where: {
            eventId_attendeeId: {
              eventId: dto.eventId,
              attendeeId: user.userId,
            },
          },
          select: { id: true, status: true },
        });

        // AC-4/AC-5: one active registration per event, and no second attempt.
        if (existing?.status === RegistrationStatus.REGISTERED) {
          throw new ConflictException(
            'You are already registered for this event.',
          );
        }

        const options = evaluateRegistration(
          event,
          await this.countRegistered(tx, dto.eventId),
          new Date(),
        );
        if (!options.canRegister) {
          throw new ConflictException(options.reason);
        }

        const data = {
          status: RegistrationStatus.REGISTERED,
          phone: dto.phone,
          dietaryRequirements: dto.dietaryRequirements ?? null,
          accessibilityNeeds: dto.accessibilityNeeds ?? null,
          withdrawnAt: null,
        };

        const registration = existing
          ? await tx.registration.update({
              where: { id: existing.id },
              data,
              select: REGISTRATION_VIEW_SELECT,
            })
          : await tx.registration.create({
              data: {
                ...data,
                eventId: dto.eventId,
                attendeeId: user.userId,
              },
              select: REGISTRATION_VIEW_SELECT,
            });

        return { registration, event };
      },
    );

    // AC-3 confirmation record — best-effort, after the registration is saved.
    await this.notifications.notifySafely({
      recipientId: user.userId,
      type: NotificationType.REGISTRATION_CONFIRMED,
      message: `You are registered for "${event.name ?? 'the event'}".`,
      relatedEventId: event.id,
    });

    return this.toView(registration, new Date());
  }

  /** US-35 AC-1/AC-2/AC-3 — the caller's own registrations, current details. */
  async findMine(user: AuthenticatedUser): Promise<{
    registrations: RegistrationView[];
    message: string | null;
  }> {
    this.access.requireScope(user, Resource.REGISTRATION, Action.READ);

    const rows = await this.prisma.registration.findMany({
      where: { attendeeId: user.userId },
      orderBy: [{ event: { proposedStart: 'asc' } }, { id: 'asc' }],
      select: REGISTRATION_VIEW_SELECT,
    });

    const now = new Date();
    return {
      registrations: rows.map((row) => this.toView(row, now)),
      // AC-3
      message: rows.length === 0 ? NO_REGISTRATIONS_MESSAGE : null,
    };
  }

  /** US-35 AC-4 — one registration; another attendee's is denied. */
  async findOne(
    user: AuthenticatedUser,
    registrationId: string,
  ): Promise<RegistrationView> {
    this.access.requireScope(user, Resource.REGISTRATION, Action.READ);

    const row = await this.loadOwned(this.prisma, user, registrationId);
    return this.toView(row, new Date());
  }

  /**
   * US-36 AC-1/AC-2/AC-3/AC-5 — withdraw an active registration before the
   * cutoff. The explicit confirmation (AC-2) is enforced by WithdrawDto.
   *
   * The event is locked first so a withdrawal and a registration for the last
   * place serialise, and the freed place (AC-4) is visible to whoever checks
   * the count next: availability counts REGISTERED rows only.
   */
  async withdraw(
    user: AuthenticatedUser,
    registrationId: string,
  ): Promise<RegistrationView> {
    this.access.requireScope(user, Resource.REGISTRATION, Action.WITHDRAW);

    const { registration, eventId, eventName } = await this.prisma.$transaction(
      async (tx) => {
        const owned = await this.loadOwned(tx, user, registrationId);
        await this.lockEvent(tx, owned.event.id);

        // Re-read under the lock: the status may have changed while waiting.
        const current = await tx.registration.findUniqueOrThrow({
          where: { id: registrationId },
          select: { status: true },
        });

        const decision = evaluateWithdrawal(
          current.status,
          owned.event,
          new Date(),
        );
        if (!decision.canWithdraw) {
          throw new ConflictException(decision.reason);
        }

        const registration = await tx.registration.update({
          where: { id: registrationId },
          data: {
            status: RegistrationStatus.WITHDRAWN,
            withdrawnAt: new Date(),
          },
          select: REGISTRATION_VIEW_SELECT,
        });

        return {
          registration,
          eventId: owned.event.id,
          eventName: owned.event.name,
        };
      },
    );

    await this.notifications.notifySafely({
      recipientId: user.userId,
      type: NotificationType.REGISTRATION_WITHDRAWN,
      message: `Your registration for "${eventName ?? 'the event'}" has been withdrawn.`,
      relatedEventId: eventId,
    });

    return this.toView(registration, new Date());
  }

  /** The event, if an Attendee may see it at all (US-02 AC-7); 404 otherwise. */
  private async findVisibleEvent(client: Db, eventId: string) {
    const event = await client.eventRequest.findUnique({
      where: { id: eventId },
      select: EVENT_FACTS_SELECT,
    });

    if (!event || !ATTENDEE_VISIBLE_STATUSES.includes(event.status)) {
      throw new NotFoundException('event not found');
    }
    return event;
  }

  /** The registration, if it is the caller's: 404 if absent, 403 if someone else's. */
  private async loadOwned(
    client: Db,
    user: AuthenticatedUser,
    registrationId: string,
  ): Promise<RegistrationRow> {
    const row = await client.registration.findUnique({
      where: { id: registrationId },
      select: REGISTRATION_VIEW_SELECT,
    });

    if (!row) {
      throw new NotFoundException('registration not found');
    }
    if (row.attendeeId !== user.userId) {
      throw new ForbiddenException('you can only view your own registrations');
    }
    return row;
  }

  private countRegistered(client: Db, eventId: string): Promise<number> {
    return client.registration.count({
      where: { eventId, status: RegistrationStatus.REGISTERED },
    });
  }

  /** Row-locks the event so register/withdraw on it run one at a time. */
  private async lockEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "EventRequest" WHERE "id" = ${eventId} FOR UPDATE`;

    if (locked.length === 0) {
      throw new NotFoundException('event not found');
    }
  }

  private toView(row: RegistrationRow, now: Date): RegistrationView {
    const { venueBookings, ...event } = row.event;

    return {
      id: row.id,
      status: row.status,
      registeredAt: row.createdAt,
      withdrawnAt: row.withdrawnAt,
      phone: row.phone,
      dietaryRequirements: row.dietaryRequirements,
      accessibilityNeeds: row.accessibilityNeeds,
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        start: event.proposedStart,
        end: event.proposedEnd,
        venue: venueBookings[0]?.venue ?? null,
      },
      withdrawal: evaluateWithdrawal(row.status, event, now),
    };
  }
}
