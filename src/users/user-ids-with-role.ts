import { Prisma, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/**
 * US-64 — the ids of every user holding a role, for notices addressed to a
 * role rather than to someone's relationship with an event (every Safety
 * Officer, for instance).
 *
 * AMBIGUOUS: the User model has no way to deactivate an account (only the
 * login lockout, which is temporary), so every holder of the role is
 * returned. Filter here once such a flag exists.
 */
export async function userIdsWithRole(
  db: PrismaService | Prisma.TransactionClient,
  role: Role,
): Promise<string[]> {
  const users = await db.user.findMany({
    where: { role },
    select: { id: true },
  });

  return users.map((user) => user.id);
}
