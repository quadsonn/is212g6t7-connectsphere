# ConnectSphere

Event management system — NestJS + Prisma + PostgreSQL API, React + TypeScript client.

An Event Organiser submits an event request; it is assigned, reviewed and
safety-checked; venues and equipment are booked; attendees register; and
everyone is notified of changes that affect them. Seven roles: Event
Organiser, Event Coordinator, Event Coordinator Lead, Safety Officer, Venue
Staff, Technical Support Staff and Attendee.

- Architecture, conventions and team decisions: [CLAUDE.md](./CLAUDE.md)
- Confirmed backlog (all story numbers follow it): [docs/BACKLOG.md](./docs/BACKLOG.md)
- Test cases, coverage and progress per sprint: [docs/testing/](./docs/testing/)
- Architecture decision records: [docs/adr/](./docs/adr/)
- Frontend specifics: [frontend/README.md](./frontend/README.md)

## Getting started (fresh clone)

### 1. Prerequisites

- **Node 22+** (CI runs Node 22; `node --version`)
- **PostgreSQL 14+**, running locally (CI uses Postgres 18). On macOS:
  ```bash
  brew install postgresql@18
  brew services start postgresql@18     # or: pg_ctl -D /opt/homebrew/var/postgresql@18 start
  ```
  Verify it's up: `psql -d postgres -c 'select 1'`

### 2. Install

```bash
npm install                      # also runs `prisma generate`
npm --prefix frontend install
npx playwright install chromium  # only needed for the browser tests
```

### 3. Configure

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

`.env.example` ships with the shared Supabase connection strings as
placeholders. For local development, replace `DATABASE_URL` and `DIRECT_URL`
with your local database. Locally they can be the same value — `DIRECT_URL`
only needs to differ behind a connection pooler such as Supabase's.
`TEST_DATABASE_URL` must stay a local database whose name ends in `_test`:
the test suites refuse to run against anything else.

**The username differs by install method** — Homebrew Postgres uses your macOS
username with no password, Docker images usually use `postgres:postgres`:

```bash
# Homebrew: print the lines to paste
echo "DATABASE_URL=\"postgresql://$(whoami)@localhost:5432/connectsphere?schema=public\""
echo "TEST_DATABASE_URL=\"postgresql://$(whoami)@localhost:5432/connectsphere_test?schema=public\""
```

**Optional:** venue photo uploads use Supabase Storage and need
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`). Without
them, everything else works normally — only uploading a photo on a venue's
edit page won't.

### 4. Create and populate the database

```bash
createdb connectsphere            # skip if it already exists
npx prisma migrate deploy         # apply all migrations
npm run prisma:seed               # two users per role + sample events, venues, equipment
npm run prisma:seed:roles         # second Coordinator Lead and Safety Officer accounts
```

Every row gets a readable, prefixed ID from the database (`EVT-001`,
`VEN-002`, …) — see CLAUDE.md §5a.

### 5. Run

```bash
npm run dev                       # API on :3000 and frontend on :5173, together
```

Open http://localhost:5173. Ctrl-C stops both. To run one side only:
`npm run start:dev` (API) or `npm run dev:web` (frontend).

### Sign in

All seeded accounts use the password `12345678`:

| Role | Accounts |
|---|---|
| Event Organiser | `organiser@connectsphere.local`, `organiser2@connectsphere.local` |
| Event Coordinator | `coordinator@connectsphere.local`, `coordinator2@connectsphere.local` |
| Event Coordinator Lead | `lead@connectsphere.local`, `lead2@connectsphere.local`* |
| Safety Officer | `safety@connectsphere.local`, `safety2@connectsphere.local`* |
| Venue Staff | `venue@connectsphere.local`, `venue2@connectsphere.local` |
| Technical Support | `tech@connectsphere.local`, `tech2@connectsphere.local` |
| Attendee | `attendee@connectsphere.local`, `attendee2@connectsphere.local` |

\* Created by `npm run prisma:seed:roles`, not the main seed.

Seed data is for local development only.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | API + frontend together |
| `npm run start:dev` | API only, watch mode |
| `npm run build` | Compile the API to `dist/` |
| `npm run lint` | oxlint over `src/` and `test/` |
| `npm run format` | Prettier over `src/` and `test/` |
| `npm test` | Unit tests (Jest) |
| `npm test -- <pattern>` | Unit tests matching a filename pattern |
| `npm test -- -t "<name>"` | A single test by name |
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:e2e` | Integration tests (Jest + Supertest; needs Postgres + `createdb`) |
| `npm run test:browser` | Browser end-to-end tests (Playwright; starts its own servers) |
| `npm --prefix frontend test` | Frontend tests (Vitest) |
| `npm --prefix frontend run lint` | oxlint over the frontend |
| `npm --prefix frontend run build` | Type-check and build the frontend |
| `npm run prisma:migrate` | Create + apply a migration in development |
| `npm run prisma:reset` | Drop and re-migrate the development database (then run `prisma:seed`) |
| `npm run prisma:seed` | Reseed the development database |
| `npm run prisma:studio` | Browse the database |

**Test isolation.** The integration suite creates and migrates
`TEST_DATABASE_URL` automatically on first run, and runs serially
(`maxWorkers: 1`) because the suites share that database. The browser suite
uses the same test database, on its own ports (API :3100, web :5174), so it
never touches a running `npm run dev`. Run the two suites one after the other,
not at the same time.

### Story demo data

Each script adds the data one story's click-through needs, on top of the main
seed. Run them against your **local** database.

| Command | Story |
|---|---|
| `npm run prisma:seed:us40` | US-40 Venue activity notifications |
| `npm run prisma:seed:us42` | US-42 Confirm event when arrangements are ready |
| `npm run prisma:seed:us44` | US-44 Release venue booking on event cancellation |
| `npm run prisma:seed:us45` | US-45 Mark a quantity of equipment damaged / under maintenance, and resolve the shortage |
| `npm run prisma:seed:us51` | US-51 Flag bookings that conflict after buffer changes |
| `npm run prisma:seed:us58` | US-58 Respond to a clarification request |
| `npm run prisma:seed:us61` | US-61 Assign Technical Support staff to an event |
| `npm run prisma:seed:us64` | US-64 Notify Safety Officers when an event awaits its safety check |
| `npm run prisma:seed:us65` | US-65 Notify the Organiser of assignment and of their own cancellation |
| `npm run prisma:seed:us66` | US-66 Assigned Technical Support receive equipment notifications |
| `npm run prisma:seed:notices` | Registration window opens / closes notices |
| `npm run prisma:seed:equip-unavailable` | Events whose committed equipment becomes unavailable |
| `npm run prisma:seed:venue-photos` | Two demo photos for every venue without any |

Click-through guides: [US-45](./docs/us45-click-through-guide.md),
[US-66](./docs/us66-click-through-guide.md).

### Dev helper scripts

| Command | Does |
|---|---|
| `npm run notices:trigger` | Runs the registration-notice sweeps once, instead of waiting for the every-minute scheduler |
| `npm run check:equip-unavailable` | Prints the state checked by the equipment-unavailable seed |
| `npm run venues:vocabulary-review` | Lists venues whose old free-text values the US-18 migration couldn't map (read-only) |

`scripts/cancel-event.ts`, `scripts/mark-venue-unavailable.ts`,
`scripts/set-venue-buffers.ts` and `prisma/seed-ui-preview.ts` are run with
`npx ts-node --compiler-options '{"module":"commonjs"}' <file>`; each file's
header gives its arguments. The `scripts/` helpers refuse to run unless the
database is local.

## Continuous integration

[.github/workflows/ci.yml](./.github/workflows/ci.yml) runs on every push and
pull request to `main`, `sprint4-main` and `Sprint3-MAIN`:

- **Backend:** `npm ci`, `prisma generate`, build, lint, unit tests with
  coverage (uploaded as an artifact), then the integration suite against a
  Postgres 18 service container.
- **Frontend:** `npm ci`, lint, build, Vitest.

The browser suite is run locally, not in CI.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Environment variable not found: DATABASE_URL` or `DIRECT_URL` | No `.env`, or missing a variable — see step 3 |
| `password authentication failed` / `role does not exist` | `DATABASE_URL` username is wrong for your Postgres install |
| Test run stops with a database-guard error | `TEST_DATABASE_URL` isn't a local database ending in `_test` |
| `Property 'x' does not exist on type` after pulling | Schema changed — run `npx prisma generate` |
| API fails on start after pulling | New migrations — run `npx prisma migrate deploy` |
| `playwright: command not found` | Dev dependencies not installed — `npm install`, then `npx playwright install chromium` |
| `Cannot reach the server` in the browser | API isn't running, or `VITE_API_URL` doesn't match |
| Login rejects a correct password | US-01 lockout after 15 failures: `psql -d connectsphere -c 'update "User" set "lockedUntil"=null, "failedLoginAttempts"=0'` |
| Lead / Safety Officer login fails | Their accounts aren't seeded — `npm run prisma:seed` (or `prisma:seed:roles`) |
| Everything fails after a reboot | Postgres isn't running (see step 1) |
| "Bucket not found" when uploading a venue photo | Supabase Storage isn't configured — see the optional note in step 3 |

---

## Team setup notes (delete before submission)

For teammates already running an older clone, migrating to the shared
Supabase database and picking up the venue-photos feature:

```bash
git pull
npm install
npx prisma generate
```

Then update your own `.env`:
- Replace `DATABASE_URL` with the shared Supabase pooled connection string.
- Add `DIRECT_URL` — the matching Supabase direct connection string.
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (needed for venue photo
  uploads).

Get the actual values from [teammate] — don't commit them anywhere.

Then run `npx prisma migrate deploy` once to bring your local Prisma Client
in sync with the shared database's schema, and restart your dev server.
