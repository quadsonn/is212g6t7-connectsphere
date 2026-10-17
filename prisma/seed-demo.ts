/**
 * W10 demo seed — the fixed starting data for the Playwright MCP experiment.
 *
 * Run it through `npm run demo:reset`, never directly: that command empties
 * the local demo database first, and this script assumes it starts empty.
 *
 * Everything here is deterministic — fixed names, fixed dates, fixed numbers —
 * so every teammate's machine shows the same screens and generated tests
 * behave the same everywhere.
 *
 * The data is built around three flows. Each has a boundary case, because the
 * planted bugs are off-by-one style and only a boundary exposes them.
 *
 *  Flow 1 — venue suitability (Coordinator)
 *    "Robotics Showcase 2027" expects exactly 120 attendees.
 *    Seminar Room B (80)     -> not suitable
 *    Lecture Theatre 1 (120) -> suitable: equal attendance fits (boundary)
 *    Main Auditorium (200)   -> suitable
 *
 *  Flow 1b — accessibility suitability (Coordinator)
 *    "Inclusive Design Forum 2027" expects 100 and needs step-free access,
 *    wheelchair seating and a hearing loop. Its date is clear of every booking.
 *    Main Auditorium (200)   -> suitable: offers all three
 *    Lecture Theatre 1 (120) -> not suitable: missing wheelchair seating and
 *                               hearing loop, each flagged on its own line
 *    Seminar Room B (80)     -> not suitable: too small and offers none
 *    Submitting a request for a flagged venue still succeeds (advisory only).
 *
 *  Flow 2 — equipment commitment (Technical Support)
 *    Projector: 4 in stock, 3 already committed to "Alumni Evening 2027",
 *    which overlaps the Showcase, so exactly 1 is free at that time.
 *    Committing 1 should succeed (boundary); committing 2 should be refused.
 *    Wireless microphone: 6 in stock, none committed.
 *
 *  Flow 3 — booking conflict (Coordinator)
 *    Main Auditorium has an APPROVED booking for "Alumni Evening 2027" on
 *    10 Mar 2027 13:00–20:00 (Singapore time, +08:00).
 *    Requesting Main Auditorium for the Showcase 09:00–17:00 overlaps -> blocked.
 *    Requesting it 09:00–13:00 only touches the edge -> allowed (boundary;
 *    bookings are half-open, so ending exactly as another starts is fine).
 *
 * All accounts use password 12345678.
 */
import 'dotenv/config';

import {
  AccessibilityFeature,
  BookingStatus,
  EventStatus,
  PrismaClient,
  ReservationStatus,
  Role,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Defence in depth: demo:reset already checks this, but this script must
// never write to anything except a local database, even if run by hand.
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
  console.error(
    `Refusing to seed: DATABASE_URL points to "${url.hostname}", not localhost. ` +
      'Use `npm run demo:reset`.',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const PASSWORD = '12345678';

// Singapore time (+08:00), written explicitly: the team's laptops are on SGT,
// so these show as the intended 09:00–17:00 etc. The fixed offset still makes
// the stored instants identical on every machine.
const at = (iso: string) => new Date(iso);

const USERS = [
  { key: 'organiser', email: 'organiser@connectsphere.local', name: 'Priya Organiser', role: Role.EVENT_ORGANISER },
  { key: 'coordinator', email: 'coordinator@connectsphere.local', name: 'Marcus Coordinator', role: Role.EVENT_COORDINATOR },
  { key: 'coordinator2', email: 'coordinator2@connectsphere.local', name: 'Fatima Coordinator', role: Role.EVENT_COORDINATOR },
  { key: 'venue', email: 'venue@connectsphere.local', name: 'Aisha Venue', role: Role.VENUE_STAFF },
  { key: 'tech', email: 'tech@connectsphere.local', name: 'Wei Technical', role: Role.TECHNICAL_SUPPORT_STAFF },
  { key: 'attendee', email: 'attendee@connectsphere.local', name: 'Sam Attendee', role: Role.ATTENDEE },
  { key: 'lead', email: 'lead@connectsphere.local', name: 'Elena Coordinator Lead', role: Role.EVENT_COORDINATOR_LEAD },
  { key: 'safety', email: 'safety@connectsphere.local', name: 'Kofi Safety Officer', role: Role.SAFETY_OFFICER },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const users: Record<string, string> = {};
  for (const { key, ...user } of USERS) {
    users[key] = (await prisma.user.create({ data: { ...user, passwordHash } })).id;
  }

  // --- Venues (Flow 1, Flow 3) --------------------------------------------
  const venueBase = {
    managedById: users.venue,
    status: VenueStatus.PUBLISHED,
    supportedLayouts: [RoomLayout.THEATRE, RoomLayout.CLASSROOM],
    operatingInfo: 'Mon–Sun, 08:00–22:00',
  };

  // Flow 1b: none / some / all of what the Inclusive Design Forum needs.
  const seminarRoom = await prisma.venue.create({
    data: { ...venueBase, name: 'Seminar Room B', location: 'Block C, Level 2', capacity: 80 },
  });
  const lectureTheatre = await prisma.venue.create({
    data: {
      ...venueBase,
      name: 'Lecture Theatre 1',
      location: 'Block A, Level 1',
      capacity: 120,
      accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS, AccessibilityFeature.ACCESSIBLE_RESTROOMS],
    },
  });
  const auditorium = await prisma.venue.create({
    data: {
      ...venueBase,
      name: 'Main Auditorium',
      location: 'Central Hub',
      capacity: 200,
      accessibilityFeatures: [
        AccessibilityFeature.STEP_FREE_ACCESS,
        AccessibilityFeature.WHEELCHAIR_ACCESSIBLE_LIFT,
        AccessibilityFeature.ACCESSIBLE_RESTROOMS,
        AccessibilityFeature.WHEELCHAIR_SEATING,
        AccessibilityFeature.HEARING_LOOP,
      ],
    },
  });

  // --- Events -------------------------------------------------------------
  const eventBase = {
    organiserId: users.organiser,
    coordinatorId: users.coordinator,
    category: 'Student engagement',
    preferredLayout: RoomLayout.THEATRE,
    registrationEnabled: false,
  };

  // The event every flow is about.
  const showcase = await prisma.eventRequest.create({
    data: {
      ...eventBase,
      name: 'Robotics Showcase 2027',
      purpose: 'Showcase final-year robotics projects to industry partners.',
      description: 'Project demos, judging and an awards session.',
      proposedStart: at('2027-03-10T09:00:00+08:00'),
      proposedEnd: at('2027-03-10T17:00:00+08:00'),
      expectedAttendance: 120,
      status: EventStatus.PLANNING,
      equipmentNeeds: 'Projectors for the demo stations and microphones for judges.',
    },
  });

  // Occupies Main Auditorium and three projectors at an overlapping time.
  const alumni = await prisma.eventRequest.create({
    data: {
      ...eventBase,
      name: 'Alumni Evening 2027',
      purpose: 'Reconnect alumni with the faculty.',
      description: 'Talks followed by a networking dinner.',
      proposedStart: at('2027-03-10T13:00:00+08:00'),
      proposedEnd: at('2027-03-10T20:00:00+08:00'),
      expectedAttendance: 150,
      status: EventStatus.PLANNING,
    },
  });

  // An approved event with no arrangements yet, for general exploration.
  await prisma.eventRequest.create({
    data: {
      ...eventBase,
      name: 'Hackathon Kickoff 2027',
      purpose: 'Launch the spring hackathon.',
      description: 'Briefing, team formation and a keynote.',
      proposedStart: at('2027-04-14T18:00:00+08:00'),
      proposedEnd: at('2027-04-14T22:00:00+08:00'),
      expectedAttendance: 60,
      status: EventStatus.APPROVED,
    },
  });

  // Flow 1b: an event with recorded accessibility requirements. 100 attendees
  // sits clear of every capacity boundary, so only accessibility decides.
  await prisma.eventRequest.create({
    data: {
      ...eventBase,
      name: 'Inclusive Design Forum 2027',
      purpose: 'Share accessible design practice with industry and students.',
      description: 'Panel discussion, live captioning and a hands-on workshop.',
      proposedStart: at('2027-05-12T10:00:00+08:00'),
      proposedEnd: at('2027-05-12T16:00:00+08:00'),
      expectedAttendance: 100,
      status: EventStatus.PLANNING,
      accessibilityRequirements: [
        AccessibilityFeature.STEP_FREE_ACCESS,
        AccessibilityFeature.WHEELCHAIR_SEATING,
        AccessibilityFeature.HEARING_LOOP,
      ],
      accessibilityNotes: 'Several panellists use wheelchairs; captioning on the main screen.',
    },
  });

  // Flow 3: the approved booking the Showcase's request collides with.
  await prisma.venueBooking.create({
    data: {
      eventId: alumni.id,
      venueId: auditorium.id,
      start: at('2027-03-10T13:00:00+08:00'),
      end: at('2027-03-10T20:00:00+08:00'),
      status: BookingStatus.APPROVED,
      requestedById: users.coordinator,
      expectedAttendance: 150,
    },
  });

  // --- Equipment (Flow 2) -------------------------------------------------
  const projector = await prisma.equipment.create({
    data: {
      type: 'Projector',
      description: 'Portable 4K projector with HDMI.',
      location: 'AV store, Block A',
      totalQuantity: 4,
    },
  });
  const microphone = await prisma.equipment.create({
    data: {
      type: 'Wireless microphone',
      description: 'Handheld wireless microphone.',
      location: 'AV store, Block A',
      totalQuantity: 6,
    },
  });

  // 3 of 4 projectors already committed over an overlapping window -> 1 free.
  await prisma.equipmentReservation.create({
    data: {
      eventId: alumni.id,
      equipmentId: projector.id,
      quantity: 3,
      start: at('2027-03-10T13:00:00+08:00'),
      end: at('2027-03-10T20:00:00+08:00'),
      status: ReservationStatus.APPROVED,
    },
  });

  // What the Coordinator has asked Technical Support for (US-28).
  await prisma.equipmentRequirement.createMany({
    data: [
      { eventId: showcase.id, equipmentId: projector.id, equipmentType: 'Projector', quantity: 2 },
      {
        eventId: showcase.id,
        equipmentId: microphone.id,
        equipmentType: 'Wireless microphone',
        quantity: 4,
        notes: 'For the judging panel',
      },
    ],
  });
  await prisma.eventRequest.update({
    where: { id: showcase.id },
    data: { technicalSupportNeeds: 'One technician on site during demos.' },
  });

  console.log('Demo data ready (password for every account: 12345678):');
  console.log(`  ${USERS.length} accounts, 3 venues (80 / 120 / 200), 4 events, 2 equipment types.`);
  console.log(`  Showcase event id: ${showcase.id}`);
  console.log(`  Venues: ${seminarRoom.name}, ${lectureTheatre.name}, ${auditorium.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
