/**
 * US-58 — demo data for "Respond to Clarification Request".
 *
 * Two requests, organised by organiser@ (Priya) and assigned to coordinator@
 * (Marcus), each waiting on an answer from the Organiser:
 *
 *   1 First question     AWAITING_CLARIFICATION, one question
 *                        → answer it on the request page; optionally "Update
 *                          request details" (e.g. attendance, layout notes)
 *   2 Second round       AWAITING_CLARIFICATION; an earlier answer already
 *                        changed the expected attendance (shown old -> new in
 *                        the history), and a follow-up question is waiting
 *
 * After answering, the request is back with coordinator@ (Under review), who
 * sees the answer and any changed details in the same history, and gets a
 * notification naming what changed.
 *
 * Re-runnable: deletes every event named [US-58] (its thread, history and
 * notifications go with it, by cascade), then recreates them. Refuses to run
 * against a non-local database.
 *
 * Usage: npm run prisma:seed:us58
 */
import 'dotenv/config';

import { EventStatus, PrismaClient, RoomLayout, User } from '@prisma/client';

const PREFIX = '[US-58]';
const FRONTEND = 'http://localhost:5173';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed US-58 test data: DATABASE_URL points at "${host}", not a local database.`);
  process.exit(1);
}

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Local time `hh:mm` on the day `days` from today. */
function at(days: number, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(Date.now() + days * DAY);
  d.setHours(h, m, 0, 0);
  return d;
}

async function main() {
  const [organiser, coordinator] = (await Promise.all(
    ['organiser', 'coordinator'].map((key) =>
      prisma.user.findUniqueOrThrow({ where: { email: `${key}@connectsphere.local` } }),
    ),
  )) as [User, User];

  const removed = await prisma.eventRequest.deleteMany({ where: { name: { startsWith: PREFIX } } });
  console.log(`removed previous run: ${removed.count} events`);

  const base = (name: string, day: number) => ({
    organiserId: organiser.id,
    coordinatorId: coordinator.id,
    name: `${PREFIX} ${name}`,
    purpose: 'US-58 clarification response demo',
    description: 'Seeded by prisma/seed-us58.ts.',
    category: 'Demo',
    proposedStart: at(day, '10:00'),
    proposedEnd: at(day, '16:00'),
    expectedAttendance: 99,
    preferredLayout: RoomLayout.THEATRE,
    submittedAt: new Date(Date.now() - 3 * HOUR),
  });

  // 1: one question waiting.
  const first = await prisma.eventRequest.create({
    data: {
      ...base('1 First question', 25),
      status: EventStatus.AWAITING_CLARIFICATION,
      clarificationRequest: 'How many people do you expect, and do you need a second exit?',
    },
  });
  await prisma.clarificationMessage.create({
    data: {
      eventId: first.id,
      authorId: coordinator.id,
      body: 'How many people do you expect, and do you need a second exit?',
      createdAt: new Date(Date.now() - 2 * HOUR),
    },
  });

  // 2: an earlier answer changed the attendance; a follow-up is waiting.
  const second = await prisma.eventRequest.create({
    data: {
      ...base('2 Second round', 26),
      expectedAttendance: 199,
      status: EventStatus.AWAITING_CLARIFICATION,
      clarificationRequest: 'Thanks. With 100–199 people, which layout do you want?',
    },
  });
  await prisma.clarificationMessage.create({
    data: {
      eventId: second.id,
      authorId: coordinator.id,
      body: 'Is 50–99 still the right attendance?',
      createdAt: new Date(Date.now() - 3 * HOUR),
    },
  });
  const change = await prisma.eventChange.create({
    data: {
      eventId: second.id,
      changedById: organiser.id,
      changes: [{ field: 'expectedAttendance', previous: 99, next: 199 }],
      createdAt: new Date(Date.now() - 2 * HOUR),
    },
  });
  await prisma.clarificationMessage.create({
    data: {
      eventId: second.id,
      authorId: organiser.id,
      body: 'No, it has grown. Updated to 100–199.',
      changeId: change.id,
      createdAt: new Date(Date.now() - 2 * HOUR),
    },
  });
  await prisma.clarificationMessage.create({
    data: {
      eventId: second.id,
      authorId: coordinator.id,
      body: 'Thanks. With 100–199 people, which layout do you want?',
      createdAt: new Date(Date.now() - HOUR),
    },
  });

  console.log(`
created 2 requests awaiting clarification:

${first.name}
    organiser: ${FRONTEND}/organiser/${first.id}
    coordinator: ${FRONTEND}/coordinator/events/${first.id}

${second.name}
    organiser: ${FRONTEND}/organiser/${second.id}
    coordinator: ${FRONTEND}/coordinator/events/${second.id}

Answer as organiser@ (optionally with "Update request details"), then check coordinator@'s view and bell.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
