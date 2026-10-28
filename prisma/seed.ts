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
  BookingDecisionKind,
  EquipmentStatus,
  BookingStatus,
  EventStatus,
  PrismaClient,
  RegistrationStatus,
  ReservationStatus,
  Role,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { photosForVenue } from './venue-photos';

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
  // Requirement changes 5 and 6.
  { email: 'lead@connectsphere.local', name: 'Elena Coordinator Lead', role: Role.EVENT_COORDINATOR_LEAD },
  { email: 'safety@connectsphere.local', name: 'Kofi Safety Officer', role: Role.SAFETY_OFFICER },
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

  // US-34/US-35: events to try the Attendee flow against. Dates are relative to
  // the day the seed runs and are refreshed on every re-run, so they stay inside
  // (or deliberately outside) the registration window: opens 2 months before
  // the start, closes 3 days before it. Only the first three should appear on
  // the Attendee page; the last three exist to prove they are hidden.
  const DAY = 24 * 60 * 60 * 1000;
  const inDays = (days: number, hour = 9) => {
    const d = new Date(Date.now() + days * DAY);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };

  const registrationScenarios = [
    { name: 'Career Fair', days: 20, expectedAttendance: 150, note: 'visible' },
    { name: 'Welcome Mixer', days: 12, expectedAttendance: 80, note: 'visible' },
    { name: 'Intimate Workshop (2 places)', days: 8, expectedAttendance: 2, note: 'visible; hides itself once two people register' },
    { name: 'Sold-Out Gala (full)', days: 15, expectedAttendance: 1, note: 'hidden: full' },
    { name: 'Last-Minute Briefing (closed)', days: 2, expectedAttendance: 40, note: 'hidden: closes 3 days before' },
    { name: 'Next Year Kickoff (not open yet)', days: 120, expectedAttendance: 200, note: 'hidden: opens 2 months before' },
  ];

  for (const scenario of registrationScenarios) {
    const start = inDays(scenario.days);
    const data = {
      ...base,
      name: scenario.name,
      status: EventStatus.CONFIRMED,
      expectedAttendance: scenario.expectedAttendance,
      proposedStart: start,
      proposedEnd: new Date(start.getTime() + 8 * 60 * 60 * 1000),
      registrationEnabled: true,
    };
    const existing = await prisma.eventRequest.findFirst({ where: { name: scenario.name } });
    if (existing) {
      await prisma.eventRequest.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          expectedAttendance: data.expectedAttendance,
          proposedStart: data.proposedStart,
          proposedEnd: data.proposedEnd,
          registrationEnabled: true,
        },
      });
    } else {
      await prisma.eventRequest.create({ data });
    }
  }

  // Fill the 1-place "full" event with the second attendee, so capacity is
  // exercised for real. Attendee 1 stays free to register for the visible events.
  const attendee2 = await prisma.user.findUniqueOrThrow({
    where: { email: 'attendee2@connectsphere.local' },
  });
  const fullEvent = await prisma.eventRequest.findFirstOrThrow({
    where: { name: 'Sold-Out Gala (full)' },
  });
  await prisma.registration.upsert({
    where: { eventId_attendeeId: { eventId: fullEvent.id, attendeeId: attendee2.id } },
    update: { status: RegistrationStatus.REGISTERED, withdrawnAt: null },
    create: {
      eventId: fullEvent.id,
      attendeeId: attendee2.id,
      status: RegistrationStatus.REGISTERED,
      phone: '+65 9000 0002',
    },
  });

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

  for (const [index, venue] of venues.entries()) {
    const existing = await prisma.venue.findFirst({ where: { name: venue.name } });
    if (existing) continue;

    await prisma.venue.create({
      data: {
        ...venue,
        imageUrls: photosForVenue(venue.name, index),
        facilities: ['POWER_OUTLETS'],
        accessibilityFeatures: ['STEP_FREE_ACCESS'],
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

  // US-25/US-26: two events in planning, so the planning edit and change
  // history can be tried locally.
  //  - "Engineering Open House" has an APPROVED venue booking and equipment
  //    reservation: date, attendance, layout, accessibility or equipment
  //    edits are flagged for review.
  //  - "Hackathon Kickoff" has only REQUESTED arrangements: every edit is an
  //    ordinary edit.
  // Both are visible to Venue Staff and Technical Support (US-25 AC-3).
  // "Alumni Homecoming" above is APPROVED, to try "Start planning" on.
  const auditorium = await prisma.venue.findFirstOrThrow({ where: { name: 'Sandbox Auditorium' } });
  const projector =
    (await prisma.equipment.findFirst({ where: { type: 'Laser projector' } })) ??
    (await prisma.equipment.create({
      data: { type: 'Laser projector', totalQuantity: 6 },
    }));

  const planningEvents = [
    {
      name: 'Engineering Open House',
      start: '2026-11-12T09:00:00Z',
      end: '2026-11-12T16:00:00Z',
      booking: BookingStatus.APPROVED,
      reservation: ReservationStatus.APPROVED,
    },
    {
      name: 'Hackathon Kickoff',
      start: '2026-11-26T18:00:00Z',
      end: '2026-11-26T22:00:00Z',
      booking: BookingStatus.REQUESTED,
      reservation: ReservationStatus.REQUESTED,
    },
  ];

  for (const event of planningEvents) {
    const existing = await prisma.eventRequest.findFirst({ where: { name: event.name } });
    if (existing) continue;

    const start = new Date(event.start);
    const end = new Date(event.end);

    const created = await prisma.eventRequest.create({
      data: {
        ...base,
        name: event.name,
        status: EventStatus.PLANNING,
        proposedStart: start,
        proposedEnd: end,
        programme: '09:00 Welcome\n10:00 Lab tours\n12:00 Lunch\n13:30 Project demos',
      },
    });

    await prisma.venueBooking.create({
      data: { eventId: created.id, venueId: auditorium.id, start, end, status: event.booking },
    });
    await prisma.equipmentReservation.create({
      data: {
        eventId: created.id,
        equipmentId: projector.id,
        quantity: 2,
        start,
        end,
        status: event.reservation,
      },
    });

    // US-28: requirements already recorded on the event with an approved
    // reservation, so editing them shows the review flag.
    if (event.reservation === ReservationStatus.APPROVED) {
      await prisma.equipmentRequirement.createMany({
        data: [
          { eventId: created.id, equipmentType: 'Laser projector', quantity: 2 },
          { eventId: created.id, equipmentType: 'Wireless microphone', quantity: 6, notes: 'Lapel' },
        ],
      });
      await prisma.eventRequest.update({
        where: { id: created.id },
        data: { technicalSupportNeeds: 'On-site AV technician for the full day.' },
      });
    }
  }

  // US-45: the history behind the items seeded as under maintenance and
  // damaged, so their pages show who changed them and why.
  const tech = await prisma.user.findUniqueOrThrow({
    where: { email: 'tech@connectsphere.local' },
  });
  const statusHistory = [
    {
      type: 'Projector (4K)',
      to: EquipmentStatus.UNDER_MAINTENANCE,
      reason: 'Lamp replacement and lens clean.',
    },
    {
      type: 'Extension reel',
      to: EquipmentStatus.OUT_OF_SERVICE,
      reason: 'Frayed cable found during inspection.',
    },
  ];
  for (const change of statusHistory) {
    const item = await prisma.equipment.findFirstOrThrow({ where: { type: change.type } });
    const recorded = await prisma.equipmentStatusChange.findFirst({
      where: { equipmentId: item.id },
    });
    if (recorded) continue;

    await prisma.equipmentStatusChange.create({
      data: {
        equipmentId: item.id,
        fromStatus: EquipmentStatus.OPERATIONAL,
        toStatus: change.to,
        // The whole item was marked, so every unit moved.
        quantity: item.totalQuantity,
        reason: change.reason,
        changedById: tech.id,
      },
    });
  }

  // US-41: a request Venue Staff rejected with a suggested alternative, not
  // yet accepted — so "Request this venue" can be tried straight away. Its
  // own event, so the guide's other scenarios are unaffected.
  const showcaseName = 'Design Week Showcase';
  if (!(await prisma.eventRequest.findFirst({ where: { name: showcaseName } }))) {
    const seminarRoom = await prisma.venue.findFirstOrThrow({ where: { name: 'Seminar Room 3-4' } });
    const start = new Date('2026-12-10T06:00:00Z');
    const end = new Date('2026-12-10T09:00:00Z');

    const showcase = await prisma.eventRequest.create({
      data: {
        ...base,
        name: showcaseName,
        status: EventStatus.APPROVED,
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: 50,
        preferredLayout: RoomLayout.CLASSROOM,
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
      },
    });
    const rejected = await prisma.venueBooking.create({
      data: {
        eventId: showcase.id,
        venueId: seminarRoom.id,
        requestedById: coordinator.id,
        start,
        end,
        expectedAttendance: 50,
        preferredLayout: RoomLayout.CLASSROOM,
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
        status: BookingStatus.REJECTED,
        decisionReason: 'Seminar Room 3-4 is being refurbished that week.',
      },
    });
    const decision = await prisma.bookingDecision.create({
      data: {
        bookingId: rejected.id,
        decidedById: venueStaff.id,
        kind: BookingDecisionKind.DECISION,
        outcome: BookingStatus.REJECTED,
        reason: 'Seminar Room 3-4 is being refurbished that week.',
      },
    });
    await prisma.bookingSuggestion.create({
      data: {
        bookingId: rejected.id,
        decisionId: decision.id,
        venueId: auditorium.id,
      },
    });
  }

  console.log(
    `Seeded ${USERS.length} users (password: ${PASSWORD}), ${events.length + planningEvents.length + 1} events, ${venues.length} venues.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
