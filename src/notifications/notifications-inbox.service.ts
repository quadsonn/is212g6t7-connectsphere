import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { linkFor, splitReason } from './notification-view';

/** How many of the newest notifications one page holds, unless asked (US-40). */
export const INBOX_DEFAULT_LIMIT = 20;
/** The most one page may hold. */
export const INBOX_LIMIT = 100;

const ITEM_INCLUDE = {
  relatedEvent: { select: { id: true, name: true } },
  relatedBooking: { select: { id: true, venue: { select: { id: true, name: true } } } },
} satisfies Prisma.NotificationInclude;

/** One notification as the page shows it. */
export interface InboxItem {
  id: string;
  type: NotificationType;
  /** The full stored message. */
  message: string;
  /** The message without its reason, and the reason on its own (if any). */
  summary: string;
  reason: string | null;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
  relatedEvent: { id: string; name: string | null } | null;
  /** US-40 AC-3: the booking request it is about, and so its venue. */
  relatedBooking: { id: string; venue: { id: string; name: string | null } } | null;
  /** Where it leads for this reader's role (see linkFor); null if nowhere. */
  link: string | null;
}

/**
 * Notifications page — a user's own notifications, which the stories already
 * record (NotificationsService). This adds only reading them and marking them
 * read; it sends nothing.
 *
 * Every query is scoped to the caller (recipientId = the logged-in user), so
 * no one can read or change another user's notifications: someone else's id
 * reads as not found. All roles hold NOTIFICATION / READ at OWN scope; marking
 * one's own notification read is part of reading one's own inbox, so it uses
 * the same grant rather than a new one.
 */
@Injectable()
export class NotificationsInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
  ) {}

  /**
   * The caller's notifications, newest first (US-40 AC-5), a page at a time.
   * `cursor` is the id of the last one already shown; the next page starts
   * after it. A page shorter than `limit` is the last. A cursor that is not
   * one of the caller's own notifications reads as not found.
   */
  async list(
    user: AuthenticatedUser,
    page: { limit?: number; cursor?: string } = {},
  ): Promise<InboxItem[]> {
    this.access.requireScope(user, Resource.NOTIFICATION, Action.READ);

    if (page.cursor) {
      const own = await this.prisma.notification.count({
        where: { id: page.cursor, recipientId: user.userId },
      });
      if (own === 0) throw new NotFoundException('notification not found');
    }

    const rows = await this.prisma.notification.findMany({
      where: { recipientId: user.userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit ?? INBOX_DEFAULT_LIMIT,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
      include: ITEM_INCLUDE,
    });

    return rows.map((row) => this.toItem(user, row));
  }

  /** How many of the caller's notifications are unread — the bell's badge. */
  async unreadCount(user: AuthenticatedUser): Promise<{ unread: number }> {
    this.access.requireScope(user, Resource.NOTIFICATION, Action.READ);

    const unread = await this.prisma.notification.count({
      where: { recipientId: user.userId, read: false },
    });
    return { unread };
  }

  /**
   * Mark one of the caller's notifications read. Another user's id — or one
   * that does not exist — is not found. Marking a read one again keeps its
   * original read time.
   */
  async markRead(user: AuthenticatedUser, id: string): Promise<InboxItem> {
    this.access.requireScope(user, Resource.NOTIFICATION, Action.READ);

    const own = await this.prisma.notification.findFirst({
      where: { id, recipientId: user.userId },
      select: { id: true },
    });
    if (!own) {
      throw new NotFoundException('notification not found');
    }

    await this.prisma.notification.updateMany({
      where: { id, recipientId: user.userId, read: false },
      data: { read: true, readAt: new Date() },
    });

    const row = await this.prisma.notification.findUniqueOrThrow({
      where: { id },
      include: ITEM_INCLUDE,
    });
    return this.toItem(user, row);
  }

  /**
   * Mark one of the caller's notifications unread again — it counts towards
   * the bell once more and its read time is cleared. Another user's id, or one
   * that does not exist, is not found.
   */
  async markUnread(user: AuthenticatedUser, id: string): Promise<InboxItem> {
    this.access.requireScope(user, Resource.NOTIFICATION, Action.READ);

    const own = await this.prisma.notification.findFirst({
      where: { id, recipientId: user.userId },
      select: { id: true },
    });
    if (!own) {
      throw new NotFoundException('notification not found');
    }

    const row = await this.prisma.notification.update({
      where: { id },
      data: { read: false, readAt: null },
      include: ITEM_INCLUDE,
    });
    return this.toItem(user, row);
  }

  /** Mark every unread notification of the caller's read. */
  async markAllRead(user: AuthenticatedUser): Promise<{ marked: number }> {
    this.access.requireScope(user, Resource.NOTIFICATION, Action.READ);

    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId: user.userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { marked: count };
  }

  private toItem(
    user: AuthenticatedUser,
    row: {
      id: string;
      type: NotificationType;
      message: string;
      read: boolean;
      readAt: Date | null;
      createdAt: Date;
      relatedEventId: string | null;
      relatedBookingId: string | null;
      relatedEquipmentId?: string | null;
      relatedEvent: { id: string; name: string | null } | null;
      relatedBooking: { id: string; venue: { id: string; name: string | null } } | null;
    },
  ): InboxItem {
    const { summary, reason } = splitReason(row.message);
    return {
      id: row.id,
      type: row.type,
      message: row.message,
      summary,
      reason,
      read: row.read,
      readAt: row.readAt,
      createdAt: row.createdAt,
      relatedEvent: row.relatedEvent,
      relatedBooking: row.relatedBooking,
      link: linkFor(user.role, row.relatedEventId, row.relatedBookingId, row.relatedEquipmentId ?? null),
    };
  }
}
