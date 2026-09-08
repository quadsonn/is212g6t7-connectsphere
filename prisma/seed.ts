/**
 * Development seed — one user per role plus a few events, so the frontend can
 * be signed into locally. Never run against a real environment.
 *
 * Usage: npm run prisma:seed
 */
import {
  AccessibilityFeature,
  EventStatus,
  PrismaClient,
  Role,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PASSWORD = '12345678';

const USERS = [
  { email: 'organiser@connectsphere.local', name: 'Priya Organiser', role: Role.EVENT_ORGANISER },
  { email: 'coordinator@connectsphere.local', name: 'Marcus Coordinator', role: Role.EVENT_COORDINATOR },
  { email: 'venue@connectsphere.local', name: 'Aisha Venue', role: Role.VENUE_STAFF },
  { email: 'tech@connectsphere.local', name: 'Wei Technical', role: Role.TECHNICAL_SUPPORT_STAFF },
  { email: 'attendee@connectsphere.local', name: 'Sam Attendee', role: Role.ATTENDEE },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      // Re-seeding must re-apply the password, otherwise changing PASSWORD
      // above has no effect on users that already exist.
      update: { passwordHash },
      create: { ...user, passwordHash },
    });
  }

  const organiser = await prisma.user.findUniqueOrThrow({
    where: { email: 'organiser@connectsphere.local' },
  });
  const coordinator = await prisma.user.findUniqueOrThrow({
    where: { email: 'coordinator@connectsphere.local' },
  });

  const base = {
    organiserId: organiser.id,
    coordinatorId: coordinator.id,
    purpose: 'Bring the cohort together and introduce campus services.',
    category: 'Student engagement',
    description: 'Full-day programme with talks, booths and a closing social.',
    expectedAttendance: 320,
    preferredLayout: RoomLayout.THEATRE,
    layoutNotes: 'Reserve front row for accessibility seating.',
    accessibilityRequirements: [
      AccessibilityFeature.HEARING_LOOP,
      AccessibilityFeature.STEP_FREE_ACCESS,
    ],
    accessibilityNotes: 'Reserve front-row seating adjacent to the ramp.',
    equipmentNeeds: 'Six wireless microphones, two projectors.',
    registrationEnabled: true,
  };

  const events = [
    { name: 'Freshman Orientation 2026', status: EventStatus.CONFIRMED, start: '2026-10-01T09:00:00Z', end: '2026-10-01T17:00:00Z' },
    { name: 'Industry Networking Night', status: EventStatus.SUBMITTED, start: '2026-10-14T18:00:00Z', end: '2026-10-14T21:30:00Z' },
    { name: 'Capstone Showcase', status: EventStatus.UNDER_REVIEW, start: '2026-11-02T09:00:00Z', end: '2026-11-02T17:00:00Z' },
    { name: 'Alumni Homecoming', status: EventStatus.APPROVED, start: '2026-11-20T10:00:00Z', end: '2026-11-20T16:00:00Z' },
    { name: 'Research Symposium (draft)', status: EventStatus.DRAFT, start: '2026-12-05T09:00:00Z', end: '2026-12-05T18:00:00Z' },
  ];

  for (const event of events) {
    const existing = await prisma.eventRequest.findFirst({ where: { name: event.name } });
    if (existing) continue;

    await prisma.eventRequest.create({
      data: {
        ...base,
        name: event.name,
        status: event.status,
        proposedStart: new Date(event.start),
        proposedEnd: new Date(event.end),
      },
    });
  }

  // Venues have no endpoint yet (the UI mocks them), but seeding keeps the
  // dev database coherent for when E4 lands.
  const venues = [
    { name: 'Sandbox Auditorium', location: 'School of Computing, Level 1', capacity: 420, status: VenueStatus.PUBLISHED },
    { name: 'Seminar Room 3-4', location: 'Administration Building, Level 3', capacity: 60, status: VenueStatus.PUBLISHED },
    { name: 'Campus Green', location: 'Outdoor, adjacent to Library', capacity: 800, status: VenueStatus.DRAFT },
  ];

  for (const venue of venues) {
    const existing = await prisma.venue.findFirst({ where: { name: venue.name } });
    if (existing) continue;

    await prisma.venue.create({
      data: {
        ...venue,
        facilities: ['Power supply'],
        accessibilityFeatures: ['Step-free access'],
        supportedLayouts: ['Theatre'],
        operatingInfo: 'Mon–Fri, 08:00–22:00',
      },
    });
  }

  console.log(`Seeded ${USERS.length} users (password: ${PASSWORD}), ${events.length} events, ${venues.length} venues.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
