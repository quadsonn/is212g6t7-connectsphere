import { Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { userIdsWithRole } from './user-ids-with-role';

/** US-64 — the first lookup of users by role. */
describe('userIdsWithRole', () => {
  it('Given users of several roles, When asked for one role, Then it returns only their ids', async () => {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'USR-001' }, { id: 'USR-002' }]) },
    };

    await expect(
      userIdsWithRole(prisma as unknown as PrismaService, Role.SAFETY_OFFICER),
    ).resolves.toEqual(['USR-001', 'USR-002']);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: Role.SAFETY_OFFICER },
      select: { id: true },
    });
  });

  it('Given nobody holds the role, Then it returns an empty list', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };

    await expect(
      userIdsWithRole(prisma as unknown as PrismaService, Role.SAFETY_OFFICER),
    ).resolves.toEqual([]);
  });
});
