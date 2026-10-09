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
  BookingStatus,
  EventStatus,
  Facility,
  PrismaClient,
  RegistrationStatus,
  ReservationStatus,
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
  // Events are shared out between the two organisers and the two coordinators
  // so each account has something to sign in to.
  const organiser2 = await prisma.user.findUniqueOrThrow({
    where: { email: 'organiser2@connectsphere.local' },
  });
  const coordinator2 = await prisma.user.findUniqueOrThrow({
    where: { email: 'coordinator2@connectsphere.local' },
  });

  const base = {
    organiserId: organiser.id,
    coordinatorId: coordinator.id,
    purpose: 'Bring the cohort together and introduce campus services.',
    category: 'Student engagement',
    description: 'Full-day programme with talks, booths and a closing social.',
    // Attendance is a band's upper bound, as the request form writes it
    // (9 / 49 / 99 / 199 / 499 / 500) — see frontend/src/lib/attendance-bands.ts.
    expectedAttendance: 499,
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

  type SeedEvent = {
    name: string;
    status: EventStatus;
    start: string;
    end: string;
    decisionReason?: string;
    expectedAttendance?: number;
    organiserId?: string;
    coordinatorId?: string;
  };

  const events: SeedEvent[] = [
    { name: 'Freshman Orientation 2026', status: EventStatus.CONFIRMED, start: '2026-10-21T09:00:00Z', end: '2026-10-21T17:00:00Z' },
    { name: 'Industry Networking Night', status: EventStatus.SUBMITTED, start: '2026-10-28T18:00:00Z', end: '2026-10-28T21:30:00Z', expectedAttendance: 199 },
    { name: 'Capstone Showcase', status: EventStatus.UNDER_REVIEW, start: '2026-11-02T09:00:00Z', end: '2026-11-02T17:00:00Z', organiserId: organiser2.id, coordinatorId: coordinator2.id },
    { name: 'Alumni Homecoming', status: EventStatus.APPROVED, start: '2026-11-20T10:00:00Z', end: '2026-11-20T16:00:00Z', coordinatorId: coordinator2.id },
    { name: 'Research Symposium (draft)', status: EventStatus.DRAFT, start: '2026-12-05T09:00:00Z', end: '2026-12-05T18:00:00Z', organiserId: organiser2.id, coordinatorId: coordinator2.id },
    { name: 'Winter Formal (cancelled)', status: EventStatus.CANCELLED, start: '2026-12-15T18:00:00Z', end: '2026-12-15T22:00:00Z', organiserId: organiser2.id, coordinatorId: coordinator2.id },
    {
      name: 'Rooftop Fundraiser (rejected)',
      status: EventStatus.REJECTED,
      start: '2026-12-20T18:00:00Z',
      end: '2026-12-20T21:00:00Z',
      decisionReason: 'Rooftop venue has no fire-safety clearance for events over 100 guests.',
      organiserId: organiser2.id,
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
        expectedAttendance: event.expectedAttendance ?? base.expectedAttendance,
        organiserId: event.organiserId ?? base.organiserId,
        coordinatorId: event.coordinatorId ?? base.coordinatorId,
        proposedStart: new Date(event.start),
        proposedEnd: new Date(event.end),
        decisionReason: event.decisionReason ?? null,
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

  // Intimate Workshop and Sold-Out Gala are deliberately off-band (2 and 1):
  // registration capacity equals expectedAttendance, and the smallest band is 9.
  const registrationScenarios: {
    name: string;
    days: number;
    expectedAttendance: number;
    note: string;
    venue: string;
    organiserId?: string;
    coordinatorId?: string;
  }[] = [
    { name: 'Career Fair', days: 20, expectedAttendance: 199, note: 'visible', venue: 'Concourse Atrium' },
    { name: 'Welcome Mixer', days: 12, expectedAttendance: 99, note: 'visible', venue: 'Function Room A', organiserId: organiser2.id, coordinatorId: coordinator2.id },
    { name: 'Intimate Workshop (2 places)', days: 8, expectedAttendance: 2, note: 'visible; hides itself once two people register', venue: 'Meeting Pod 1', organiserId: organiser2.id, coordinatorId: coordinator2.id },
    { name: 'Sold-Out Gala (full)', days: 15, expectedAttendance: 1, note: 'hidden: full', venue: 'Discussion Room 2-01' },
    { name: 'Last-Minute Briefing (closed)', days: 2, expectedAttendance: 49, note: 'hidden: closes 3 days before', venue: 'Seminar Room 3-4', organiserId: organiser2.id },
    { name: 'Next Year Kickoff (not open yet)', days: 120, expectedAttendance: 499, note: 'hidden: opens 2 months before', venue: 'Singapore Conference Hall', organiserId: organiser2.id, coordinatorId: coordinator2.id },
  ];

  for (const scenario of registrationScenarios) {
    const start = inDays(scenario.days);
    const data = {
      ...base,
      name: scenario.name,
      status: EventStatus.CONFIRMED,
      organiserId: scenario.organiserId ?? base.organiserId,
      coordinatorId: scenario.coordinatorId ?? base.coordinatorId,
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
      phone: '+6590000002',
    },
  });

  // Venues have no endpoint yet (the UI mocks them), but seeding keeps the
  // dev database coherent for when E4 lands.
  const venueStaff = await prisma.user.findUniqueOrThrow({
    where: { email: 'venue@connectsphere.local' },
  });

  const venueStaff2 = await prisma.user.findUniqueOrThrow({
    where: { email: 'venue2@connectsphere.local' },
  });

  // Details by kind of space, so venue search and suitability have something to
  // match against.
  const profiles = {
    basic: {
      facilities: [Facility.POWER_OUTLETS],
      accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
      supportedLayouts: [RoomLayout.THEATRE],
      operatingInfo: 'Mon–Fri, 08:00–22:00',
    },
    hall: {
      facilities: [Facility.SOUND_SYSTEM, Facility.MICROPHONE, Facility.STAGE, Facility.PROJECTOR, Facility.SCREEN, Facility.WIFI, Facility.AIR_CONDITIONING, Facility.POWER_OUTLETS, Facility.CATERING_KITCHEN],
      accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS, AccessibilityFeature.WHEELCHAIR_ACCESSIBLE_LIFT, AccessibilityFeature.ACCESSIBLE_RESTROOMS, AccessibilityFeature.ACCESSIBLE_PARKING],
      supportedLayouts: [RoomLayout.EVENT_HALL, RoomLayout.BANQUET, RoomLayout.THEATRE],
      operatingInfo: 'Daily, 08:00–23:00',
    },
    lounge: {
      facilities: [Facility.WIFI, Facility.POWER_OUTLETS, Facility.AIR_CONDITIONING, Facility.SOUND_SYSTEM],
      accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS, AccessibilityFeature.WHEELCHAIR_ACCESSIBLE_LIFT, AccessibilityFeature.ACCESSIBLE_RESTROOMS],
      supportedLayouts: [RoomLayout.BANQUET, RoomLayout.EVENT_HALL],
      operatingInfo: 'Daily, 09:00–21:00',
    },
    room: {
      facilities: [Facility.PROJECTOR, Facility.SCREEN, Facility.WHITEBOARD, Facility.WIFI, Facility.AIR_CONDITIONING, Facility.POWER_OUTLETS],
      accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS, AccessibilityFeature.WHEELCHAIR_ACCESSIBLE_LIFT, AccessibilityFeature.ACCESSIBLE_RESTROOMS],
      supportedLayouts: [RoomLayout.CLASSROOM, RoomLayout.U_SHAPE, RoomLayout.BOARDROOM],
      operatingInfo: 'Mon–Fri, 08:00–22:00',
    },
    smallRoom: {
      facilities: [Facility.SCREEN, Facility.WHITEBOARD, Facility.VIDEO_CONFERENCING, Facility.WIFI, Facility.AIR_CONDITIONING, Facility.POWER_OUTLETS],
      accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS, AccessibilityFeature.WHEELCHAIR_ACCESSIBLE_LIFT, AccessibilityFeature.ACCESSIBLE_RESTROOMS],
      supportedLayouts: [RoomLayout.BOARDROOM],
      operatingInfo: 'Mon–Fri, 08:00–22:00',
    },
  };

  // The first three are the original dev venues; the rest are the spaces the
  // CONFIRMED events below are booked into (they also exist in the shared
  // catalogue, where the lookup by name finds them and skips the create).
  const venues = [
    { name: 'Sandbox Auditorium', location: 'School of Computing, Level 1', capacity: 420, status: VenueStatus.PUBLISHED, profile: profiles.basic },
    { name: 'Seminar Room 3-4', location: 'Administration Building, Level 3', capacity: 60, status: VenueStatus.PUBLISHED, profile: profiles.basic },
    { name: 'Campus Green', location: 'Outdoor, adjacent to Library', capacity: 800, status: VenueStatus.DRAFT, profile: profiles.basic },
    { name: 'Multi-Purpose Hall', location: 'Student Centre, Level 1', capacity: 600, status: VenueStatus.PUBLISHED, profile: profiles.hall },
    { name: 'Singapore Conference Hall', location: 'Shenton Way', capacity: 800, status: VenueStatus.PUBLISHED, profile: profiles.hall },
    { name: 'Concourse Atrium', location: 'School of Computing, Level 1', capacity: 800, status: VenueStatus.PUBLISHED, profile: profiles.lounge, managedById: venueStaff2.id },
    { name: 'Function Room A', location: 'Administration Building, Level 2', capacity: 100, status: VenueStatus.PUBLISHED, profile: profiles.room, managedById: venueStaff2.id },
    { name: 'Meeting Pod 1', location: 'Co-working Space, Level 2', capacity: 8, status: VenueStatus.PUBLISHED, profile: profiles.smallRoom },
    { name: 'Discussion Room 2-01', location: 'School of Economics, Level 2', capacity: 12, status: VenueStatus.PUBLISHED, profile: profiles.smallRoom },
  ];

  for (const { profile, managedById, ...venue } of venues) {
    const existing = await prisma.venue.findFirst({ where: { name: venue.name } });
    if (existing) continue;

    await prisma.venue.create({
      data: {
        ...venue,
        ...profile,
        // US-13: drafts are visible only to their manager.
        managedById: managedById ?? venueStaff.id,
      },
    });
  }

  // Every CONFIRMED event has an approved venue booking, decided by the venue's
  // manager. Booking times follow the event, so the scenario events (whose dates
  // are refreshed on each run) keep their booking in step.
  const confirmedBookings = [
    { event: 'Freshman Orientation 2026', venue: 'Multi-Purpose Hall' },
    ...registrationScenarios.map((scenario) => ({ event: scenario.name, venue: scenario.venue })),
  ];

  for (const { event: eventName, venue: venueName } of confirmedBookings) {
    const event = await prisma.eventRequest.findFirstOrThrow({ where: { name: eventName } });
    const venue = await prisma.venue.findFirstOrThrow({ where: { name: venueName } });
    const start = event.proposedStart as Date;
    const end = event.proposedEnd as Date;

    const existing = await prisma.venueBooking.findFirst({ where: { eventId: event.id } });
    if (existing) {
      await prisma.venueBooking.update({
        where: { id: existing.id },
        data: { start, end, expectedAttendance: event.expectedAttendance },
      });
      continue;
    }

    const booking = await prisma.venueBooking.create({
      data: {
        eventId: event.id,
        venueId: venue.id,
        start,
        end,
        status: BookingStatus.APPROVED,
        requestedById: event.coordinatorId ?? coordinator.id,
        expectedAttendance: event.expectedAttendance,
        preferredLayout: event.preferredLayout,
        layoutNotes: event.layoutNotes,
        accessibilityRequirements: event.accessibilityRequirements,
        accessibilityNotes: event.accessibilityNotes,
        equipmentNeeds: event.equipmentNeeds,
      },
    });
    await prisma.bookingDecision.create({
      data: {
        bookingId: booking.id,
        decidedById: venue.managedById ?? venueStaff.id,
        outcome: BookingStatus.APPROVED,
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
    {
      type: 'Laser projector',
      description: 'Laser projector, ceiling-mountable, HDMI and USB-C input.',
      location: 'AV Store Room, Level 2',
      totalQuantity: 6,
      technicalSpecs: '5000 lumens, HDMI/USB-C',
      operationalStatus: EquipmentStatus.OPERATIONAL,
    },
    {
      type: 'Wheelchair',
      description: 'Foldable manual wheelchair for attendees.',
      location: 'Facilities Store, Level 1',
      totalQuantity: 10,
      operationalStatus: EquipmentStatus.OPERATIONAL,
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
  const projector = await prisma.equipment.findFirstOrThrow({
    where: { type: 'Laser projector' },
  });

  const planningEvents = [
    {
      name: 'Engineering Open House',
      start: '2026-11-12T09:00:00Z',
      end: '2026-11-12T16:00:00Z',
      expectedAttendance: 199,
      booking: BookingStatus.APPROVED,
      reservation: ReservationStatus.APPROVED,
    },
    {
      name: 'Hackathon Kickoff',
      start: '2026-11-26T18:00:00Z',
      end: '2026-11-26T22:00:00Z',
      expectedAttendance: 199,
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
        // 199 fits Sandbox Auditorium (420), where both events are booked.
        expectedAttendance: event.expectedAttendance,
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

  console.log(
    `Seeded ${USERS.length} users (password: ${PASSWORD}), ${events.length + planningEvents.length} events, ${venues.length} venues.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
