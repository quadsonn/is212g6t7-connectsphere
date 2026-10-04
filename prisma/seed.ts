/**
 * Development seed — one user per role plus a few events, so the frontend can
 * be signed into locally. Never run against a real environment.
 *
 * Usage: npm run prisma:seed
 */
// The Prisma CLI loads .env by itself, but this script is plain ts-node and
// does not — without this, DATABASE_URL is unset on a fresh clone.
import 'dotenv/config';

import {
  AccessibilityFeature,
  EquipmentStatus,
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
  { email: 'organiser2@connectsphere.local', name: 'Diego Organiser', role: Role.EVENT_ORGANISER },
  { email: 'coordinator@connectsphere.local', name: 'Marcus Coordinator', role: Role.EVENT_COORDINATOR },
  { email: 'coordinator2@connectsphere.local', name: 'Fatima Coordinator', role: Role.EVENT_COORDINATOR },
  { email: 'venue@connectsphere.local', name: 'Aisha Venue', role: Role.VENUE_STAFF },
  { email: 'venue2@connectsphere.local', name: 'Liam Venue', role: Role.VENUE_STAFF },
  { email: 'tech@connectsphere.local', name: 'Wei Technical', role: Role.TECHNICAL_SUPPORT_STAFF },
  { email: 'tech2@connectsphere.local', name: 'Nadia Technical', role: Role.TECHNICAL_SUPPORT_STAFF },
  { email: 'attendee@connectsphere.local', name: 'Sam Attendee', role: Role.ATTENDEE },
  { email: 'attendee2@connectsphere.local', name: 'Omar Attendee', role: Role.ATTENDEE },
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
    { name: 'Winter Formal (cancelled)', status: EventStatus.CANCELLED, start: '2026-12-15T18:00:00Z', end: '2026-12-15T22:00:00Z' },
    {
      name: 'Rooftop Fundraiser (rejected)',
      status: EventStatus.REJECTED,
      start: '2026-12-20T18:00:00Z',
      end: '2026-12-20T21:00:00Z',
      decisionReason: 'Rooftop venue has no fire-safety clearance for events over 100 guests.',
    },
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
        decisionReason: 'decisionReason' in event ? event.decisionReason : null,
      },
    });
  }

  // Venues have no endpoint yet (the UI mocks them), but seeding keeps the
  // dev database coherent for when E4 lands.
  const venueStaff = await prisma.user.findUniqueOrThrow({
    where: { email: 'venue@connectsphere.local' },
  });

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
        supportedLayouts: [RoomLayout.THEATRE],
        operatingInfo: 'Mon–Fri, 08:00–22:00',
        // US-13: drafts are visible only to their manager.
        managedById: venueStaff.id,
      },
    });
  }

  // US-29: the Technical Support catalogue.
  const equipment = [
    {
      type: 'Wireless microphone',
      description: 'Handheld UHF mic, 4-hour battery life.',
      location: 'AV Store Room, Level 1',
      totalQuantity: 24,
      operationalStatus: EquipmentStatus.OPERATIONAL,
    },
    {
      type: 'Portable PA system',
      description: 'Battery-powered speaker with mixer input.',
      location: 'AV Store Room, Level 1',
      totalQuantity: 6,
      operationalStatus: EquipmentStatus.OPERATIONAL,
    },
    {
      type: 'Projector (4K)',
      description: 'Ceiling-mountable, HDMI and USB-C input.',
      location: 'AV Store Room, Level 2',
      totalQuantity: 8,
      operationalStatus: EquipmentStatus.UNDER_MAINTENANCE,
    },
    {
      type: 'Folding table',
      description: '6ft rectangular, seats 6.',
      location: 'Furniture Store, Basement',
      totalQuantity: 40,
      operationalStatus: EquipmentStatus.OPERATIONAL,
    },
    {
      type: 'Extension reel',
      description: '10m, 4-socket.',
      location: 'AV Store Room, Level 1',
      totalQuantity: 15,
      operationalStatus: EquipmentStatus.OUT_OF_SERVICE,
    },
  ];

  for (const item of equipment) {
    const existing = await prisma.equipment.findFirst({ where: { type: item.type } });
    if (existing) continue;

    await prisma.equipment.create({ data: item });
  }

  console.log(`Seeded ${USERS.length} users (password: ${PASSWORD}), ${events.length} events, ${venues.length} venues, ${equipment.length} equipment items.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
