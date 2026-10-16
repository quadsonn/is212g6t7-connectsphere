/**
 * Shapes returned by the ConnectSphere API.
 *
 * These mirror the backend contract (Prisma schema + controllers) and are the
 * single definition used across the app — never redeclare an API shape inside
 * a component.
 */

/** Mirrors the backend Role enum. */
export const ROLES = [
  'EVENT_ORGANISER',
  'EVENT_COORDINATOR',
  'VENUE_STAFF',
  'TECHNICAL_SUPPORT_STAFF',
  'ATTENDEE',
  'EVENT_COORDINATOR_LEAD',
  'SAFETY_OFFICER',
] as const;
export type Role = (typeof ROLES)[number];

/** Mirrors the backend EventStatus enum exactly. */
export const EVENT_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'AWAITING_CLARIFICATION',
  'RETURNED',
  'REJECTED',
  'PLANNING',
  'AWAITING_ARRANGEMENTS',
  // US-42: arrangements confirmed; waiting for the Safety Officer (US-57).
  'AWAITING_SAFETY_CHECK',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Mirrors the backend RoomLayout enum (US-06). Shared with venue suitability. */
export const ROOM_LAYOUTS = [
  'THEATRE',
  'CLASSROOM',
  'BANQUET',
  'BOARDROOM',
  'EVENT_HALL',
  'U_SHAPE',
] as const;
export type RoomLayout = (typeof ROOM_LAYOUTS)[number];

/** Mirrors the backend AccessibilityFeature enum (US-06), in display order. */
export const ACCESSIBILITY_FEATURES = [
  'STEP_FREE_ACCESS',
  'WHEELCHAIR_ACCESSIBLE_LIFT',
  'ACCESSIBLE_PARKING',
  'ACCESSIBLE_RESTROOMS',
  'WHEELCHAIR_SEATING',
  'HEARING_LOOP',
  'NURSING_ROOM',
] as const;
export type AccessibilityFeature = (typeof ACCESSIBILITY_FEATURES)[number];

/** Labels that `humanise()` can't derive from the enum code. */
export const ACCESSIBILITY_FEATURE_LABELS: Record<AccessibilityFeature, string> = {
  STEP_FREE_ACCESS: 'Step-free access',
  WHEELCHAIR_ACCESSIBLE_LIFT: 'Wheelchair-accessible lift',
  ACCESSIBLE_PARKING: 'Accessible parking / drop-off',
  ACCESSIBLE_RESTROOMS: 'Wheelchair-accessible restrooms',
  WHEELCHAIR_SEATING: 'Wheelchair seating spaces',
  HEARING_LOOP: 'Hearing loop',
  NURSING_ROOM: 'Nursing room',
};

/** Mirrors the backend Facility enum (US-18), in display order. */
export const FACILITIES = [
  'PROJECTOR',
  'SCREEN',
  'SOUND_SYSTEM',
  'MICROPHONE',
  'STAGE',
  'WIFI',
  'VIDEO_CONFERENCING',
  'WHITEBOARD',
  'POWER_OUTLETS',
  'CATERING_KITCHEN',
  'AIR_CONDITIONING',
] as const;
export type Facility = (typeof FACILITIES)[number];

export const FACILITY_LABELS: Record<Facility, string> = {
  PROJECTOR: 'Projector',
  SCREEN: 'Projection screen',
  SOUND_SYSTEM: 'Sound system',
  MICROPHONE: 'Microphones',
  STAGE: 'Stage',
  WIFI: 'Wi-Fi',
  VIDEO_CONFERENCING: 'Video conferencing',
  WHITEBOARD: 'Whiteboard',
  POWER_OUTLETS: 'Power outlets',
  CATERING_KITCHEN: 'Catering kitchen',
  AIR_CONDITIONING: 'Air conditioning',
};

/** Mirrors the backend VenueStatus enum. */
export type VenueStatus = 'DRAFT' | 'PUBLISHED';

/** POST /auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  accessToken: string;
}

/** GET /auth/me */
export interface CurrentUser {
  userId: string;
  role: Role;
  jti: string;
  exp?: number;
}

/** GET /auth/me/permissions */
export interface PermittedAction {
  resource: string;
  action: string;
  scope: 'ANY' | 'OWN' | 'ASSIGNED' | 'PUBLIC' | 'RELATED';
}
export interface PermissionsResponse {
  role: Role;
  permissions: PermittedAction[];
}

/**
 * GET /events — the full record, as returned to an Organiser or Coordinator.
 */
export interface EventRequest {
  id: string;
  organiserId: string;
  coordinatorId: string | null;
  /**
   * Nullable since US-04: a saved draft may have required fields still empty.
   * Anything past DRAFT is guaranteed complete by a database CHECK constraint,
   * but the type reflects the model rather than the happy path.
   */
  name: string | null;
  purpose: string | null;
  description: string | null;
  category: string | null;
  /** US-25: the running order, refined by the Coordinator during planning. */
  programme: string | null;
  proposedStart: string | null;
  proposedEnd: string | null;
  expectedAttendance: number | null;
  preferredLayout: RoomLayout | null;
  layoutNotes: string | null;
  accessibilityRequirements: AccessibilityFeature[];
  accessibilityNotes: string | null;
  equipmentNeeds: string | null;
  /** US-28 AC-2: technical support the Coordinator has asked for. */
  technicalSupportNeeds: string | null;
  registrationEnabled: boolean;
  status: EventStatus;
  /** US-05: why a Coordinator rejected the request. */
  decisionReason: string | null;
  /** US-05: what a Coordinator asked the Organiser to clarify. */
  clarificationRequest: string | null;
  /** US-42 AC-4: when, and by whom, the Coordinator confirmed the arrangements. */
  arrangementsConfirmedAt?: string | null;
  arrangementsConfirmedById?: string | null;
  createdAt: string;
  updatedAt: string;
  clarifications?: ClarificationMessage[];
  /** US-28 AC-1: present on the Coordinator and staff views. */
  equipmentRequirements?: EquipmentRequirement[];
}

/** US-28 AC-1 — one line of equipment an event needs. */
export interface EquipmentRequirement {
  id: string;
  /** US-37: the catalogue item this line is, or null for a free-text line. */
  equipmentId?: string | null;
  equipmentType: string;
  quantity: number;
  notes: string | null;
  /** US-42: a free-text line the Coordinator has checked by hand. */
  manuallyConfirmedAt?: string | null;
  manuallyConfirmedById?: string | null;
}

/** US-42 — one line of the confirmation checklist. */
export interface ReadinessItem {
  kind: 'VENUE' | 'EQUIPMENT';
  label: string;
  status: 'OK' | 'MISSING' | 'NEEDS_MANUAL_CHECK';
}

/** US-42 — GET /events/:id/confirmation-readiness. */
export interface ConfirmationReadiness {
  ready: boolean;
  items: ReadinessItem[];
}

/** PATCH /events/:id/technical-requirements. Omit a key to leave it as is. */
export interface TechnicalRequirementsPayload {
  equipment?: { equipmentType: string; quantity: number; notes?: string | null }[];
  technicalSupportNeeds?: string | null;
}

/** One entry in an event's clarification thread (US-09). */
export interface ClarificationMessage {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; email: string; role: Role };
}

/** Payload for POST /events (submit) and POST /events/drafts (save). */
export interface EventRequestPayload {
  name?: string;
  purpose?: string;
  description?: string;
  category?: string;
  proposedStart?: string;
  proposedEnd?: string;
  expectedAttendance?: number;
  preferredLayout?: RoomLayout | null;
  layoutNotes?: string;
  accessibilityRequirements?: AccessibilityFeature[];
  accessibilityNotes?: string;
  equipmentNeeds?: string;
  registrationEnabled?: boolean;
}

/** US-25 — the fields a Coordinator may change during planning. */
export interface PlanningUpdatePayload {
  name?: string;
  purpose?: string;
  description?: string;
  category?: string;
  programme?: string | null;
  proposedStart?: string;
  proposedEnd?: string;
  expectedAttendance?: number;
  preferredLayout?: RoomLayout | null;
  layoutNotes?: string | null;
  accessibilityRequirements?: AccessibilityFeature[];
  accessibilityNotes?: string | null;
  equipmentNeeds?: string | null;
  registrationEnabled?: boolean;
}

/** US-25 AC-2 — an already-confirmed arrangement an edit can put at risk. */
export type ConfirmedArrangement = 'VENUE_BOOKING' | 'EQUIPMENT_RESERVATION';

/** US-26 — one field's before/after in a history entry. Dates are ISO strings. */
export interface FieldChange {
  /** 'coordinator' records a reassignment (US-27 AC-4), by name. */
  field:
    | keyof PlanningUpdatePayload
    | 'coordinator'
    | 'equipmentRequirements'
    | 'technicalSupportNeeds';
  previous: string | number | boolean | string[] | null;
  next: string | number | boolean | string[] | null;
}

/** US-26 AC-2 — what changed, previous/new values, who, and when. */
export interface EventChangeEntry {
  id: string;
  eventId: string;
  changes: FieldChange[];
  requiresReview: boolean;
  affectedArrangements: ConfirmedArrangement[];
  createdAt: string;
  changedBy: { id: string; name: string; email: string; role: Role };
}

/** GET /events/:id/history. `message` is set only when there are no entries. */
export interface EventChangeHistory {
  eventId: string;
  entries: EventChangeEntry[];
  message: string | null;
}

/** US-11 — the consolidated status view the API attaches to every request. */
export interface EventStatusView {
  status: EventStatus;
  isTerminal: boolean;
  /** Present only when the status represents a Coordinator decision. */
  decision: { outcome: EventStatus; reason: string | null } | null;
  clarificationRequested: boolean;
}

/** GET /events/mine — the Organiser's status view (US-05). */
export interface OrganiserRequestView extends EventRequest {
  statusView: EventStatusView;
  /** Derived server-side from clarificationRequest; never stored. */
  clarificationRequested: boolean;
  /** US-37: the undecided change request, shown beside the original details. */
  pendingChangeRequest?: ChangeRequest | null;
  /** US-38 AC-5: the latest decided request, so a rejection's reason shows. */
  latestChangeDecision?: ChangeRequest | null;
}

export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** US-37 — one line of a proposed equipment list. */
export interface ChangeRequestEquipmentLine {
  id: string;
  equipmentId: string;
  quantity: number;
  equipment: { id: string; type: string };
}

/**
 * US-37 — an Organiser's proposed change. A null proposed* field means that
 * field is not being changed; `equipment` is the complete proposed list when
 * `equipmentChanged` is true.
 */
export interface ChangeRequest {
  id: string;
  eventId: string;
  status: ChangeRequestStatus;
  reason: string;
  proposedStart: string | null;
  proposedEnd: string | null;
  proposedAttendance: number | null;
  equipmentChanged: boolean;
  equipment: ChangeRequestEquipmentLine[];
  createdAt: string;
  /** US-38: set once a Coordinator has decided. */
  decidedAt?: string | null;
  decisionReason?: string | null;
}

/** US-38 AC-1 — a pending request in the Coordinator's queue. */
export interface PendingChangeRequestSummary extends ChangeRequest {
  requestedBy: ContactSummary;
  event: {
    id: string;
    name: string | null;
    status: EventStatus;
    proposedStart: string | null;
    proposedEnd: string | null;
    expectedAttendance: number | null;
  };
}

/** US-38 AC-6 — shown before the Coordinator decides. */
export interface CapacityWarning {
  type: 'CAPACITY_EXCEEDED';
  bookingId: string;
  bookingStatus: string;
  venueId: string;
  venueName: string | null;
  capacity: number;
  proposedAttendance: number;
  message: string;
}

/** A clash found at the proposed new time (venue or equipment). */
export interface ImpactWarning {
  type: 'VENUE_CONFLICT' | 'VENUE_BLOCKED' | 'EQUIPMENT_UNAVAILABLE';
  message: string;
}

export type ReviewWarning = CapacityWarning | ImpactWarning;

export interface TimeWindowIso {
  start: string;
  end: string;
}

/**
 * What approving a date or time change would do to the event's existing
 * arrangements: bookings move and wait for Venue Staff again, equipment
 * reservations are released for Technical Support to commit again.
 */
export interface RescheduleImpact {
  newWindow: TimeWindowIso | null;
  venueBookings: {
    bookingId: string;
    venueName: string | null;
    status: string;
    from: TimeWindowIso;
    to: TimeWindowIso;
  }[];
  equipmentReservations: {
    reservationId: string;
    equipmentType: string;
    quantity: number;
    status: string;
  }[];
}

/** What an approval actually moved and released. */
export interface ReschedulingResult {
  venueBookings: {
    bookingId: string;
    venueName: string | null;
    previousStatus: string;
    from: TimeWindowIso;
    to: TimeWindowIso;
  }[];
  equipmentReservations: {
    reservationId: string;
    equipmentType: string;
    quantity: number;
    previousStatus: string;
  }[];
}

/** US-38 AC-2 — a request beside the event as it is now. */
export interface ChangeRequestReview {
  request: ChangeRequest & { requestedBy: ContactSummary };
  event: {
    id: string;
    name: string | null;
    status: EventStatus;
    proposedStart: string | null;
    proposedEnd: string | null;
    expectedAttendance: number | null;
    equipmentRequirements: {
      id: string;
      equipmentId: string | null;
      equipmentType: string;
      quantity: number;
    }[];
  };
  warnings: ReviewWarning[];
  impact: RescheduleImpact;
}

/** US-38 AC-4 — the decided request, and the history entry an approval wrote. */
export interface ChangeRequestApproval {
  request: ChangeRequest;
  change: EventChangeEntry | null;
  arrangements: ReschedulingResult;
}

/** POST /events/:id/change-requests. Send only what should change. */
export interface ChangeRequestPayload {
  reason: string;
  proposedStart?: string;
  proposedEnd?: string;
  proposedAttendance?: number;
  equipment?: { equipmentId: string; quantity: number }[];
}

/** GET /events/equipment-catalogue — what the change request picker offers. */
export interface CatalogueOption {
  id: string;
  type: string;
  description: string | null;
  location: string | null;
}

/** A user's contact details, resolved from an id (coordinator, organiser). */
export interface ContactSummary {
  id: string;
  name: string;
  email: string;
}

/** GET /events/assigned and GET /events/assigned/:id — the Coordinator's view. */
export interface CoordinatorRequestView extends OrganiserRequestView {
  coordinator: ContactSummary | null;
  organiser: ContactSummary;
  clarifications: ClarificationMessage[];
}

/** PATCH /events/:id/planning — the saved event, plus what was recorded. */
export interface PlanningUpdateResult extends CoordinatorRequestView {
  /** Null when the save changed nothing. */
  change: EventChangeEntry | null;
}

/**
 * GET /events/:id as Venue Staff / Technical Support (US-25 AC-3): the full
 * record, with the assigned Coordinator resolved.
 */
export interface RelatedEventView extends EventRequest {
  coordinator: ContactSummary | null;
}

/**
 * GET /events — the Attendee's view. The backend projects internal planning
 * fields away (US-02 AC-7), so this is a genuinely different shape from
 * EventRequest.
 *
 * `coordinator` IS included here (US-10 AC-3): the assigned point of contact
 * is visible to any authorised user, not just Organisers/Coordinators.
 */
export interface PublicEventView {
  id: string;
  name: string | null;
  purpose: string | null;
  description: string | null;
  proposedStart: string | null;
  proposedEnd: string | null;
  status: EventStatus;
  registrationEnabled: boolean;
  coordinator: ContactSummary | null;
}

/** Venue catalogue. Endpoint not built yet — served by a mock service. */
export interface Venue {
  id: string;
  /** Nullable since US-13: a draft venue may be incomplete. */
  name: string | null;
  location: string | null;
  capacity: number | null;
  /** US-18: controlled vocabularies, so search can match them exactly. */
  facilities: Facility[];
  facilityNotes: string | null;
  /** The same enum an Organiser requests from (US-06). */
  accessibilityFeatures: AccessibilityFeature[];
  accessibilityNotes: string | null;
  /** The shared US-06 lookup, same values an event request uses. */
  supportedLayouts: RoomLayout[];
  operatingInfo: string | null;
  /** US-49: minutes the venue is occupied before / after each event (0-480). */
  setupMinutes: number;
  turnaroundMinutes: number;
  status: VenueStatus;
  /** The Venue Staff member who owns this entry (US-13 AC-4). */
  managedById: string | null;
  createdAt: string;
  updatedAt: string;
  imageUrls: string[];
}

/** US-49 — PATCH /venues/:id/buffers. US-51: `confirmConflicts` is "save anyway". */
export interface VenueBuffersPayload {
  setupMinutes: number;
  turnaroundMinutes: number;
  confirmConflicts?: boolean;
}

/** US-51 — one side of a buffer clash. */
export interface BufferClashParty {
  bookingId: string;
  eventName: string | null;
  start: string;
  end: string;
}

/** US-51 — a booking the new buffers would flag, and what it would clash with. */
export interface BufferClash extends BufferClashParty {
  clashesWith: BufferClashParty;
}

/** US-51 — POST /venues/:id/buffers/preview, and the 409 body of a refused save. */
export interface BufferPreview {
  clashes: BufferClash[];
}

/** US-51 — PATCH /venues/:id/buffers: the venue plus how many bookings were flagged. */
export type VenueBuffersResult = Venue & { flagged: number };

/** US-14 — a warning returned alongside an edit that may invalidate bookings. */
export interface VenueUpdateWarning {
  code: 'BOOKINGS_MAY_NEED_REVIEW';
  message: string;
  reasons: string[];
  affectedBookingIds: string[];
}

/** US-17 — one day of a venue's availability calendar. */
export type DayStatus = 'free' | 'tentative' | 'booked';

/**
 * GET /venues/:id/availability returns an array of these and nothing else —
 * deliberately no event, organiser or booking id (US-17 AC-3).
 */
export interface DayAvailability {
  /** ISO date in Singapore time, e.g. "2026-10-03". */
  date: string;
  status: DayStatus;
}

/**
 * US-18 — GET /venues/search. Lists are sent comma-separated; from/to are ISO
 * instants and go together.
 */
export interface VenueSearchQuery {
  /** US-15 AC-3, restored: name fragment, case-insensitive. */
  name?: string;
  from?: string;
  to?: string;
  minCapacity?: number;
  accessibility?: string;
  facilities?: string;
}

/** US-20 — the outcome of one suitability check. */
export type SuitabilityCheckStatus = 'MET' | 'UNMET' | 'NOT_REQUIRED' | 'NOT_RECORDED';

/**
 * GET /venues/:id/suitability?eventId= — advisory flags for one venue against
 * one event. `facilities` and `equipment` are null until those checks exist;
 * `notChecked` says why, so the UI never implies they passed.
 */
export interface VenueSuitability {
  overall: 'SUITABLE' | 'NOT_SUITABLE' | 'INCOMPLETE';
  overallSuitable: boolean;
  capacity: {
    status: SuitabilityCheckStatus;
    venueCapacity: number | null;
    expectedAttendance: number | null;
  };
  accessibility: {
    status: SuitabilityCheckStatus;
    items: { requirement: AccessibilityFeature; met: boolean }[];
  };
  layout: { status: SuitabilityCheckStatus; requirement: RoomLayout | null };
  facilities: { requirement: Facility; met: boolean }[] | null;
  equipment: { item: string; available: boolean }[] | null;
  notChecked: { check: 'facilities' | 'equipment'; reason: string }[];
}

/** US-15 — catalogue search and sort. */
export interface BrowseVenuesQuery {
  search?: string;
  sortBy?: 'name' | 'capacity' | 'location';
  sortOrder?: 'asc' | 'desc';
}

/** US-29 — condition of an equipment item, shown in its full detail view. */
export type EquipmentStatus = 'OPERATIONAL' | 'UNDER_MAINTENANCE' | 'OUT_OF_SERVICE';

/**
 * US-29 — a catalogue row: the four fields shown at a glance (AC-1).
 * Operational status is only on the detail read (AC-2).
 */
export interface EquipmentListItem {
  id: string;
  type: string;
  description: string | null;
  location: string | null;
  totalQuantity: number;
}

/** US-29 AC-2 — GET /equipment/:id, the full record. */
export interface Equipment extends EquipmentListItem {
  operationalStatus: EquipmentStatus;
}

/** US-29 AC-3 — catalogue search and sort. */
export interface BrowseEquipmentQuery {
  search?: string;
  sortBy?: 'type' | 'location' | 'totalQuantity';
  sortOrder?: 'asc' | 'desc';
}

/** US-30 — GET /equipment/:id/availability query. */
export interface AvailabilityQuery {
  start: string;
  end: string;
  quantity: number;
}

/** US-30 — one equipment type's availability for a date and time. */
export interface ItemAvailability {
  equipmentId: string;
  type: string;
  operationalStatus: EquipmentStatus;
  start: string;
  end: string;
  requestedQuantity: number;
  totalQuantity: number;
  /** AC-3: units excluded because the item is damaged or under maintenance. */
  unavailableQuantity: number;
  /** AC-2: peak units committed to overlapping events in the window. */
  reservedQuantity: number;
  availableQuantity: number;
  /** AC-4: false when the requested quantity is not fully available. */
  fullyAvailable: boolean;
  /** AC-4: how many more units were requested than are free; 0 if none. */
  shortfall: number;
}

/** US-31 — one equipment line the Coordinator recorded (US-28). */
export interface CoordinatorRequirement {
  id: string;
  equipmentType: string;
  quantity: number;
  notes: string | null;
}

/** US-31 — GET /equipment/requirements[/:eventId]. */
export interface EventRequirements {
  eventId: string;
  name: string | null;
  description: string | null;
  status: EventStatus;
  proposedStart: string | null;
  proposedEnd: string | null;
  /** AC-1/AC-2: the Organiser's free-text equipment needs, in full. */
  organiserEquipmentNeeds: string | null;
  /** AC-1/AC-2: the Coordinator's requirement rows. */
  coordinatorRequirements: CoordinatorRequirement[];
  /** AC-1/AC-2: the Coordinator's technical support notes. */
  technicalSupportNeeds: string | null;
  /** AC-3: false when none of the three is recorded; `message` says so. */
  hasRequirements: boolean;
  message: string | null;
}

/** US-31 — GET /equipment/requirements/:eventId/details ("View more details"). */
export interface EventRequirementDetails {
  eventId: string;
  name: string | null;
  description: string | null;
  status: EventStatus;
  proposedStart: string | null;
  proposedEnd: string | null;
  expectedAttendance: number | null;
  preferredLayout: RoomLayout | null;
  layoutNotes: string | null;
  accessibilityRequirements: AccessibilityFeature[];
  accessibilityNotes: string | null;
  programme: string | null;
  coordinator: { name: string; email: string } | null;
}

export type ReservationStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RELEASED';

/** US-32 — POST /equipment/reservations. */
export interface CommitReservationPayload {
  eventId: string;
  equipmentId: string;
  quantity: number;
}

/** US-32 — a confirmed commitment. */
export interface CommittedReservation {
  id: string;
  eventId: string;
  equipmentId: string;
  quantity: number;
  start: string;
  end: string;
  status: ReservationStatus;
  createdAt: string;
  equipment: { id: string; type: string };
}

/** US-33 AC-3 — GET /equipment/reservations/released. */
export interface ReleasedReservation {
  id: string;
  quantity: number;
  start: string;
  end: string;
  status: ReservationStatus;
  releasedAt: string;
  equipment: { id: string; type: string };
  event: { id: string; name: string | null; status: EventStatus };
}

export type RegistrationStatus = 'REGISTERED' | 'WITHDRAWN';

/** US-34 AC-2 — the registration form. Name and email come from the account. */
export interface RegisterPayload {
  eventId: string;
  phone: string;
  dietaryRequirements?: string;
  accessibilityNeeds?: string;
}

/** US-35/US-36 — one of the caller's registrations, with the event's current details. */
export interface RegistrationView {
  id: string;
  status: RegistrationStatus;
  registeredAt: string;
  withdrawnAt: string | null;
  phone: string;
  dietaryRequirements: string | null;
  accessibilityNeeds: string | null;
  event: {
    id: string;
    name: string | null;
    status: EventStatus;
    start: string | null;
    end: string | null;
    venue: { id: string; name: string | null; location: string | null } | null;
  };
  withdrawal: {
    canWithdraw: boolean;
    reason: string | null;
    withdrawalCutoffAt: string | null;
  };
}

/** GET /registrations/me. `message` is set when the list is empty (US-35 AC-3). */
export interface MyRegistrations {
  registrations: RegistrationView[];
  message: string | null;
}

/** Nest's error envelope, plus the loginUrl our UnauthorizedFilter adds. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  loginUrl?: string;
}

/**
 * US-13 (Add a new venue) AC-1/AC-2 and US-14 (Update a venue's details) AC-1:
 * body for POST /venues/drafts and PATCH /venues/:id.
 * Every field optional — US-13 AC-2 requires an incomplete venue to be saveable.
 */
export interface VenueDraftPayload {
  name?: string | null;
  location?: string | null;
  capacity?: number | null;
  facilities?: Facility[];
  facilityNotes?: string | null;
  accessibilityFeatures?: AccessibilityFeature[];
  accessibilityNotes?: string | null;
  supportedLayouts?: RoomLayout[];
  layoutNotes?: string | null;
  operatingInfo?: string | null;
}

/**
 * US-14 AC-3: "notified that existing bookings may need review" — the PATCH
 * response carries that warning inline, on top of the updated venue.
 */
export interface VenueWithWarnings extends Venue {
  warnings: VenueUpdateWarning[];
}
/**
 * Mirrors the backend BookingStatus enum. REQUESTED is "pending" (US-21 AC-3).
 * US-54: HELD is a tentative hold, live only until holdExpiresAt; RELEASED is
 * a hold released by Venue Staff or by expiry.
 */
export type BookingStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'HELD' | 'RELEASED';

/**
 * US-21 AC-4/AC-5 — something occupying a requested slot: an existing
 * booking, or (US-16) a period Venue Staff have blocked out.
 */
export interface BookingConflict {
  kind: 'BOOKING' | 'BLOCK';
  bookingId: string | null;
  blockId?: string;
  eventName: string | null;
  /** Why the time is blocked, for kind BLOCK. */
  reason?: string;
  start: string;
  end: string;
  status: BookingStatus | 'BLOCKED';
}

/** US-21 AC-5 — submitted, but another pending request overlaps. */
export interface BookingWarning {
  code: 'OVERLAPS_PENDING_REQUEST';
  message: string;
  conflicts: BookingConflict[];
}

/** A venue booking request with its venue, event and requester resolved. */
export interface VenueBooking {
  id: string;
  eventId: string;
  venueId: string;
  start: string;
  end: string;
  status: BookingStatus;
  decisionReason: string | null;
  expectedAttendance: number | null;
  /** US-21 AC-2: the event's requirements as they were when submitted. */
  preferredLayout: RoomLayout | null;
  layoutNotes: string | null;
  accessibilityRequirements: AccessibilityFeature[];
  accessibilityNotes: string | null;
  equipmentNeeds: string | null;
  createdAt: string;
  updatedAt: string;
  venue: { id: string; name: string | null; location: string | null; capacity: number | null };
  event: { id: string; name: string | null; status: EventStatus; organiser: ContactSummary };
  requestedBy: ContactSummary | null;
  /** US-23 AC-4/AC-6: every decision and reversal, oldest first. */
  decisions: BookingDecision[];
  /**
   * US-51: "Conflict - needs review" — a buffer change made this booking
   * clash with another. Never changes start, end or status.
   */
  needsReview: boolean;
  needsReviewReason: string | null;
  flaggedAt: string | null;
  reviewResolvedAt: string | null;
  reviewResolvedById: string | null;
  /** US-54: a tentative hold — when it expires, who placed it, how it ended. */
  holdExpiresAt: string | null;
  heldById: string | null;
  holdWarningSentAt: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
}

/** US-54 — GET /venues/:venueId/holdable-events: an event a hold may be placed for. */
export interface HoldableEvent {
  id: string;
  name: string | null;
  proposedStart: string | null;
  proposedEnd: string | null;
  expectedAttendance: number | null;
  coordinator: { id: string; name: string } | null;
}

/** US-54 — POST /venues/:venueId/holds. */
export interface PlaceHoldPayload {
  eventId: string;
  start: string;
  end: string;
  expiresAt: string;
}

/** US-23 — one recorded decision. Append-only: never edited after the fact. */
export interface BookingDecision {
  id: string;
  /**
   * US-51: REVIEW_RESOLVED clears a conflict flag; outcome is the unchanged status.
   * US-44: RELEASE — released because the event was cancelled.
   */
  kind: 'DECISION' | 'REVERSAL' | 'REVIEW_RESOLVED' | 'RELEASE';
  outcome: BookingStatus;
  reason: string | null;
  createdAt: string;
  /** US-44: null when the system recorded it (a cancellation with no known actor). */
  decidedBy: (ContactSummary & { role: Role }) | null;
}

/** POST /bookings */
export interface BookingRequestPayload {
  eventId: string;
  venueId: string;
  start: string;
  end: string;
  expectedAttendance: number;
}

/** POST /bookings response (US-21). */
export interface BookingRequestResult extends VenueBooking {
  warnings: BookingWarning[];
}

/** US-24 — an overlapping booking, named for Venue Staff (AC-4). */
export interface OverlappingBooking {
  bookingId: string;
  eventName: string | null;
  start: string;
  end: string;
}

/** US-24 — a blocked-out period (US-16) overlapping the request. */
export interface OverlappingBlock {
  blockId: string;
  reason: string;
  start: string;
  end: string;
}

/**
 * GET /bookings/:id/conflicts — US-24. Hard: approved bookings and blocks,
 * which refuse approval. Soft: pending requests, a warning only.
 */
export interface BookingConflictReport {
  hardConflicts: OverlappingBooking[];
  softConflicts: OverlappingBooking[];
  blocks: OverlappingBlock[];
  hasHardConflict: boolean;
}

/** POST /bookings 409 body (US-21 AC-4); approve 409 adds code + report (US-24). */
export interface BookingConflictErrorBody extends ApiErrorBody {
  conflicts?: BookingConflict[];
  code?: 'BOOKING_HARD_CONFLICT';
  report?: BookingConflictReport;
}

/** POST /bookings/:id/approve|reject|reverse — US-24 adds soft-conflict warnings. */
export type BookingDecisionResult = VenueBooking & { warnings: BookingWarning[] };

/** GET /bookings/queue — US-22. */
export interface BookingQueueQuery {
  view?: 'pending' | 'decided';
  venueId?: string;
  status?: BookingStatus;
  from?: string;
  to?: string;
  sortBy?: 'eventDate' | 'submitted';
  sortOrder?: 'asc' | 'desc';
}

/** One queue entry: the full request plus its urgency (US-22 AC-5). */
export interface BookingQueueEntry extends VenueBooking {
  urgent: boolean;
  daysUntilStart: number;
}

/**
 * US-16 — what occupies a calendar slot. Anything else is available.
 * US-54: TENTATIVE is a live hold; a pending request is PENDING.
 */
export type CalendarEntryKind = 'PENDING' | 'TENTATIVE' | 'CONFIRMED' | 'BLOCKED';

export interface CalendarEntry {
  /** Booking id, or block id when kind is BLOCKED. */
  id: string;
  kind: CalendarEntryKind;
  venueId: string;
  start: string;
  end: string;
  eventName: string | null;
  organiserName: string | null;
  expectedAttendance: number | null;
  reason: string | null;
  createdByName: string | null;
  /** US-51: "Conflict - needs review", alongside kind. Always false for a block. */
  needsReview: boolean;
  needsReviewReason: string | null;
  /** US-54 AC-4: when a TENTATIVE hold expires; null otherwise. */
  holdExpiresAt: string | null;
}

/** GET /calendar */
export interface CalendarView {
  venues: { id: string; name: string | null; location: string | null; capacity: number | null }[];
  entries: CalendarEntry[];
}

export interface CalendarQuery {
  from: string;
  to: string;
  venueId?: string;
}

/** POST /calendar/blocks */
export interface VenueBlockPayload {
  venueId: string;
  start: string;
  end: string;
  reason: string;
}

export interface VenueBlockResult {
  id: string;
  venueId: string;
  start: string;
  end: string;
  reason: string;
  /** Live bookings already inside the new block. */
  overlappingBookings: BookingConflict[];
}

/** Notifications page — GET /notifications: one of the reader's own notifications. */
export interface InboxNotification {
  id: string;
  type: string;
  /** The full stored message. */
  message: string;
  /** The message without its reason, and the reason on its own (if any). */
  summary: string;
  reason: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  relatedEvent: { id: string; name: string | null } | null;
  /** US-40 AC-3: the booking request it is about, and so its venue. */
  relatedBooking: { id: string; venue: { id: string; name: string | null } } | null;
  /** Where it leads for this reader's role; null if nowhere. */
  link: string | null;
}

/** US-40 — GET /notifications paging: `cursor` is the last id already shown. */
export interface NotificationsPageQuery {
  limit?: number;
  cursor?: string;
}
