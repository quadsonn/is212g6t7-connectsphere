import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface NotifyInput {
  recipientId: string;
  type: NotificationType;
  message: string;
  relatedEventId?: string | null;
}

/**
 * E9 INTEGRATION POINT — partial implementation, raised by US-09 AC-4.
 *
 * What this does today: persists a Notification row, so "the Coordinator is
 * notified" is a real, queryable fact rather than a silent no-op.
 *
 * What it does NOT do: deliver anything. There is no email, push, websocket or
 * in-app feed — those belong to the notifications story (E9), along with read
 * receipts and any digest behaviour. When E9 lands it should take over this
 * service rather than adding a second notification path.
 *
 * Callers must treat notification as best-effort: a delivery failure must
 * never roll back the business action that triggered it (see notifySafely).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Records a notification. Participates in the caller's transaction if given. */
  async notify(
    input: NotifyInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    await client.notification.create({
      data: {
        recipientId: input.recipientId,
        type: input.type,
        message: input.message,
        relatedEventId: input.relatedEventId ?? null,
      },
    });
  }

  /**
   * Fire-and-forget variant for use after a transaction has committed: a
   * notification that cannot be recorded must not undo the action the user
   * successfully performed.
   */
  async notifySafely(input: NotifyInput): Promise<void> {
    try {
      await this.notify(input);
    } catch (error) {
      this.logger.error(
        `failed to record ${input.type} for user ${input.recipientId}`,
        error as Error,
      );
    }
  }
}
