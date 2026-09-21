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
] as const;
export type RoomLayout = (typeof ROOM_LAYOUTS)[number];

/** Mirrors the backend AccessibilityFeature enum (US-06). */
export const ACCESSIBILITY_FEATURES = [
  'STEP_FREE_ACCESS',
  'HEARING_LOOP',
  'ACCESSIBLE_RESTROOMS',
] as const;
export type AccessibilityFeature = (typeof ACCESSIBILITY_FEATURES)[number];

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
  scope: 'ANY' | 'OWN' | 'ASSIGNED' | 'PUBLIC';
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
  proposedStart: string | null;
  proposedEnd: string | null;
  expectedAttendance: number | null;
  preferredLayout: RoomLayout | null;
  layoutNotes: string | null;
  accessibilityRequirements: AccessibilityFeature[];
  accessibilityNotes: string | null;
  equipmentNeeds: string | null;
  registrationEnabled: boolean;
  status: EventStatus;
  /** US-05: why a Coordinator rejected the request. */
  decisionReason: string | null;
  /** US-05: what a Coordinator asked the Organiser to clarify. */
  clarificationRequest: string | null;
  createdAt: string;
  updatedAt: string;
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
}

/**
 * GET /events as returned to an Attendee — the backend projects internal
 * planning fields away (US-02 AC-7), so this is a genuinely different shape.
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
}

/** Venue catalogue. Endpoint not built yet — served by a mock service. */
export interface Venue {
  id: string;
  /** Nullable since US-13: a draft venue may be incomplete. */
  name: string | null;
  location: string | null;
  capacity: number | null;
  facilities: string[];
  /** Free text — deliberately not the AccessibilityFeature enum (US-13). */
  accessibilityFeatures: string[];
  /** The shared US-06 lookup, same values an event request uses. */
  supportedLayouts: RoomLayout[];
  operatingInfo: string | null;
  status: VenueStatus;
  /** The Venue Staff member who owns this entry (US-13 AC-4). */
  managedById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** US-14 — a warning returned alongside an edit that may invalidate bookings. */
export interface VenueUpdateWarning {
  code: 'BOOKINGS_MAY_NEED_REVIEW';
  message: string;
  reasons: string[];
  affectedBookingIds: string[];
}

/** US-15 — catalogue search and sort. */
export interface BrowseVenuesQuery {
  search?: string;
  sortBy?: 'name' | 'capacity' | 'location';
  sortOrder?: 'asc' | 'desc';
}

/** Equipment inventory. Endpoint not built yet — served by a mock service. */
export interface Equipment {
  id: string;
  type: string;
  totalQuantity: number;
  technicalSpecs: string | null;
}

/**
 * An equipment request awaiting Technical Support review. Composed from
 * EquipmentReservation + Equipment; no endpoint exposes it yet.
 */
export interface EquipmentReservationSummary {
  id: string;
  eventId: string;
  eventName: string;
  equipmentType: string;
  quantity: number;
  start: string;
  end: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
}

/** An attendee's registration state for an event. No endpoint yet. */
export interface RegistrationSummary {
  eventId: string;
  status: 'REGISTERED' | 'WITHDRAWN' | null;
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
  facilities?: string[];
  accessibilityFeatures?: string[];
  supportedLayouts?: RoomLayout[];
  operatingInfo?: string;
}

/**
 * US-14 AC-3: "notified that existing bookings may need review" — the PATCH
 * response carries that warning inline, on top of the updated venue.
 */
export interface VenueWithWarnings extends Venue {
  warnings: VenueUpdateWarning[];
}