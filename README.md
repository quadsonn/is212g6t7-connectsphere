# ConnectSphere

Event management system — NestJS + Prisma + PostgreSQL API, React + TypeScript client.

- Architecture, conventions and open decisions: [CLAUDE.md](./CLAUDE.md)
- Frontend specifics: [frontend/README.md](./frontend/README.md)

## Getting started (fresh clone)

### 1. Prerequisites

- **Node 22+** (`node --version`)
- **PostgreSQL 14+**, running locally. On macOS:
  ```bash
  brew install postgresql@18
  brew services start postgresql@18     # or: pg_ctl -D /opt/homebrew/var/postgresql@18 start
  ```
  Verify it's up: `psql -d postgres -c 'select 1'`

### 2. Install

```bash
npm install                      # also runs `prisma generate`
npm --prefix frontend install
```

### 3. Configure

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Then edit `.env` and set `DATABASE_URL` / `TEST_DATABASE_URL` for your machine.
**The username differs by install method** — Homebrew Postgres uses your macOS
username with no password, Docker images usually use `postgres:postgres`:

```bash
# Homebrew: print the line to paste
echo "postgresql://$(whoami)@localhost:5432/connectsphere?schema=public"
```

### 4. Create and populate the database

```bash
createdb connectsphere            # skip if it already exists
npx prisma migrate deploy         # apply all migrations
npm run prisma:seed               # one user per role + sample events and venues
```

### 5. Run

```bash
npm run dev                       # API on :3000 and frontend on :5173, together
```

Open http://localhost:5173. Ctrl-C stops both. To run one side only:
`npm run start:dev` (API) or `npm run dev:web` (frontend).

### Sign in

All seeded accounts use the password `12345678`:

| Email | Role |
|---|---|
| `organiser@connectsphere.local` | Event Organiser |
| `coordinator@connectsphere.local` | Event Coordinator |
| `coordinator2@connectsphere.local` | Event Coordinator 2 |
| `venue@connectsphere.local` | Venue Staff |
| `tech@connectsphere.local` | Technical Support |
| `attendee@connectsphere.local` | Attendee |

Seed data is for local development only.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | API + frontend together |
| `npm run start:dev` | API only, watch mode |
| `npm run build` | Compile the API to `dist/` |
| `npm run lint` | oxlint over `src/` and `test/` |
| `npm test` | Unit tests |
| `npm test -- <pattern>` | Unit tests matching a filename pattern |
| `npm test -- -t "<name>"` | A single test by name |
| `npm run test:e2e` | End-to-end tests (needs Postgres + `createdb`) |
| `npm run test:cov` | Coverage |
| `npm run prisma:migrate` | Create + apply a migration in development |
| `npm run prisma:seed` | Reseed the development database |
| `npm run prisma:studio` | Browse the database |

The e2e suite creates and migrates `TEST_DATABASE_URL` automatically on first
run, and runs serially (`maxWorkers: 1`) because the suites share that database.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Environment variable not found: DATABASE_URL` | No `.env` — see step 3 |
| `password authentication failed` / `role does not exist` | `DATABASE_URL` username is wrong for your Postgres install |
| `Property 'x' does not exist on type` after pulling | Schema changed — run `npx prisma generate` |
| `Cannot reach the server` in the browser | API isn't running, or `VITE_API_URL` doesn't match |
| Login rejects a correct password | US-01 lockout after 15 failures: `psql -d connectsphere -c 'update "User" set "lockedUntil"=null, "failedLoginAttempts"=0'` |
| Everything fails after a reboot | Postgres isn't running (see step 1) |
