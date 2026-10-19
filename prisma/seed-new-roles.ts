/**
 * Creates ONLY the login accounts for the roles added by requirement changes
 * 5 and 6 — two per role, like every other role's test accounts (lead@ and
 * lead2@, safety@ and safety2@). Nothing else is written: no events, venues,
 * equipment, and no changes to any existing user. IDs (USR-…) come from the
 * database.
 *
 * Safe to run against the shared database, and safe to run twice: an account
 * that already exists is left exactly as it is.
 *
 * Usage: npm run prisma:seed:roles
 * Requires the migration that adds the two roles to have been deployed.
 */
import 'dotenv/config';

import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PASSWORD = '12345678';

const ACCOUNTS = [
  { email: 'lead@connectsphere.local', name: 'Elena Coordinator Lead', role: Role.EVENT_COORDINATOR_LEAD },
  { email: 'safety@connectsphere.local', name: 'Kofi Safety Officer', role: Role.SAFETY_OFFICER },
  // A second account per role, for "another Lead" / "another Safety Officer" checks.
  { email: 'lead2@connectsphere.local', name: 'Ravi Coordinator Lead', role: Role.EVENT_COORDINATOR_LEAD },
  { email: 'safety2@connectsphere.local', name: 'Mei Safety Officer', role: Role.SAFETY_OFFICER },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const account of ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });

    if (existing) {
      console.log(`exists, left unchanged: ${account.email} (${existing.role})`);
      continue;
    }

    await prisma.user.create({ data: { ...account, passwordHash } });
    console.log(`created: ${account.email} (${account.role})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
