# ConnectSphere — Backend Architecture Brief

> Context document for Claude Code. This is a **starting architecture**, not a frozen spec — it will be refined sprint by sprint. Treat it as the shared plan the team codes against. When generating code, follow this structure; where a decision isn't covered here, flag it rather than inventing precision.

## 1. What we're building

ConnectSphere is an **event management system**. Internal staff and external attendees manage events end-to-end: an Event Organiser submits an event request, an Event Coordinator reviews and approves it, venues and equipment are booked, attendees register, and everyone is notified of relevant changes.

The system must support **coherent end-to-end workflows**, not isolated features. An event request progresses through review → venue booking → equipment reservation, and a change to an event may cascade into bookings, equipment, registration, and notifications.

### Roles (5)
Access to data and actions depends on the user's role and their relationship to a specific event:
- **Event Organiser** — creates/submits event requests, requests changes, views their own events.
- **Event Coordinator** — reviews requests, assigns/coordinates events, manages venues/equipment/bookings for events they own.
- **Venue Staff** — reviews and approves/rejects venue booking requests.
- **Technical Support Staff** — reviews equipment requests, checks availability, reserves equipment.
- **Attendee** — views permitted event info, registers/withdraws, sees their registration status.

## 2. Technology stack (decided)

| Concern | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** | Type safety catches agent-generated errors at compile time. |
| Framework | **NestJS** | Modular, opinionated structure maps cleanly to C4 components and to our epics. |
| Database | **PostgreSQL** | Relational data with strong integrity needs (bookings, reservations, statuses). |
| ORM | **Prisma** | Type-safe queries; `schema.prisma` doubles as living documentation. |
| API style | **REST** | Consumed by a separate frontend. |
| Auth | **JWT + role-based access control (RBAC)** | Stateless; role claim drives a NestJS guard. |
| Testing | **Jest** (Nest default) + Supertest for e2e | Unit + integration + e2e; traceable to user stories. |
| Validation | **class-validator / class-transformer** (Nest DTOs) | Enforces acceptance criteria at the boundary. |

> These are team decisions. Be ready to justify each in the Week 13 Q&A. Don't silently swap any of them.

## 3. Architectural principles

1. **Modular by domain.** One NestJS module per bounded area (auth, events, venues, bookings, equipment, registration, notifications). Modules own their controllers, services, DTOs, and Prisma access.
2. **Layered within a module:** `Controller` (HTTP + auth guards) → `Service` (business rules) → `Prisma` (persistence). Business logic lives in services, never in controllers.
3. **Authorisation is central, not scattered.** A single RBAC mechanism (roles) plus ownership checks (does this user relate to this event?). Every protected endpoint declares required roles.
4. **Status transitions are explicit.** Event/booking/registration statuses change only through defined service methods that validate the transition — never by arbitrary field writes.
5. **Vertical slices.** Each user story should be buildable and demoable end-to-end (endpoint → service → DB → test), not layer-by-layer.
6. **Testable acceptance criteria are the contract.** Each story's ACs become integration/e2e tests. The traceability chain is: user story → acceptance criteria → test → code.

## 4. Module map (maps to our epics E1–E9)

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── guards/            # JwtAuthGuard, RolesGuard
│   ├── decorators/        # @Roles(), @CurrentUser()
│   ├── enums/             # Role, EventStatus, BookingStatus, RegistrationStatus
│   └── filters/           # global exception filter
├── auth/                  # E1  — login, JWT issue/verify, RBAC
├── users/                 # user records + roles
├── events/                # E2/E3 — event requests, drafts, review, status, change requests
├── venues/                # E4  — catalogue, availability, search/filter, suitability
├── bookings/              # E5  — venue booking requests, approval, conflict detection
├── equipment/             # E6  — equipment requests, availability, reservation
├── registrations/         # E7  — attendee registration/withdrawal
├── notifications/         # E9  — notification records for significant events
└── prisma/                # PrismaModule + PrismaService (shared)
```

> Change requests (E8) live inside the `events` module since they operate on events. Split into their own module only if they grow complex.

## 5. Core domain model (first-pass Prisma entities)

Refine as stories are estimated — this is the starting shape, not the final schema.

- **User** — id, email, passwordHash, role (enum), name. A user has exactly one role for now.
- **EventRequest** — id, organiserId (→User), coordinatorId (→User, nullable), name, purpose, description, proposedStart, proposedEnd, expectedAttendance, preferredLayout, layoutNotes, accessibilityNeeds, equipmentNeeds, registrationEnabled, status (enum), timestamps.
- **Venue** — id, name, location, capacity, facilities, accessibilityFeatures, supportedLayouts, operatingInfo.
- **VenueBooking** — id, eventId (→EventRequest), venueId (→Venue), start, end, status (enum), decisionReason (nullable). Used for conflict detection over (venueId, time range).
- **Equipment** — id, type, totalQuantity, technicalSpecs.
- **EquipmentReservation** — id, eventId, equipmentId, quantity, start, end, status.
- **Registration** — id, eventId, attendeeId (→User), status (enum), timestamps.
- **Notification** — id, recipientId (→User), type (enum), message, relatedEventId, read, createdAt.

### Key status enums
- **EventStatus:** DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, PLANNING, CONFIRMED, COMPLETED, CANCELLED
- **BookingStatus:** REQUESTED, APPROVED, REJECTED
- **RegistrationStatus:** REGISTERED, WITHDRAWN

## 6. Auth & authorisation (E1 — build first)

- **Login** issues a signed JWT containing `userId` and `role`.
- **`JwtAuthGuard`** validates the token on protected routes.
- **`RolesGuard` + `@Roles(...)`** decorator restricts an endpoint to permitted roles.
- **Ownership checks** live in services: e.g. an Organiser may read an `EventRequest` only if `organiserId === currentUser.id`; a Coordinator only for events assigned to them. Role alone is not enough — the relationship to the event matters (per the customer requirements).
- Passwords hashed with **bcrypt**. Never store plaintext.

## 7. Illustrative REST endpoints (Sprint 1 slice)

The Sprint 1 goal is the core happy path: **login → create/submit/draft event request → coordinator review**.

```
POST   /auth/login                      → { accessToken }           (public)
POST   /auth/logout                     → 204                       (auth)

POST   /events                          create request/draft        (Organiser)
GET    /events                          list my events              (Organiser: own; Coordinator: assigned)
GET    /events/:id                      view one (status + reason)   (owner/assigned only)
PATCH  /events/:id                      edit draft                   (Organiser, own draft)
POST   /events/:id/submit               draft → submitted            (Organiser, own)

POST   /events/:id/review               approve/reject/clarify       (Coordinator, assigned)
```

Later sprints add venue (`/venues`, `/bookings`), equipment (`/equipment`), registration (`/registrations`), notifications (`/notifications`).

## 8. Testing expectations (build from Sprint 2 as topics are taught)

- **Unit tests** on service business rules (status transitions, conflict detection, suitability checks).
- **Integration/e2e tests** (Supertest) per user story, named so they trace back to the story/AC they verify.
- **CI pipeline** runs the test suite on push (add when CI is taught; fold into a later sprint).
- Goal: given any core user story, we can point to the test(s) that prove it works — this is our Week 13 evidence.

## 9. What NOT to do

- Don't put business logic in controllers.
- Don't let endpoints skip the roles/ownership checks "for now."
- Don't change a status by writing the field directly — go through the transition method.
- Don't bulk-generate modules we haven't estimated. Build the Sprint 1 slice first, learn our velocity, then expand.
- Don't invent requirements the customer briefing doesn't state — flag gaps instead.
- Don't let a migration silently discard existing values when converting free text to an enum or controlled list. Follow the US-18 pattern (`20261003120000_us18_venue_vocabulary`): map known values, move anything unmatched into a notes column with a clear marker, announce it, and add a migration test against old-format data (see `test/venue-vocabulary-migration.e2e-spec.ts`). US-06 and US-13 set unmatched layouts to NULL or dropped them — don't copy that.

---

### How to use this with Claude Code
Put this file at the repo root (e.g. `ARCHITECTURE.md` or in `CLAUDE.md`) so it's picked up as project context. When asking Claude Code to build a feature, reference the relevant user story and its acceptance criteria, and ask it to generate the controller + service + DTO + tests together as a vertical slice. Review everything it produces — **you are accountable for all submitted code.**
