# W10 demo — local database setup

The Playwright MCP demo runs against a **local** copy of ConnectSphere's
database on your own machine, never the shared Supabase. Every teammate gets
identical data, so screens and generated tests match everywhere.

## One-time setup

1. You need PostgreSQL running locally (port 5432).
2. `git checkout w10_demo && git pull && npm install`
3. **Only if** your Postgres needs a username/password other than your OS
   login (e.g. the official installer's `postgres` user):
   `cp .env.demo.example .env.demo` and edit `DEMO_DATABASE_URL`.

## Every time

```bash
npm run demo:reset   # wipe + refill the local demo database (do before every run)
npm run dev:demo     # start the app against it
```

Then open **http://localhost:5173** (the API is on :3000 — the agent should use 5173).

The first line of either command must say
`[demo] ... LOCAL database localhost:5432/connectsphere_demo`.
Both commands refuse to run unless the database is on `localhost` and its name
contains `demo`, and they never use your `.env`'s Supabase settings.

Stop any normal `npm run dev` first — both need ports 5173 and 3000.
Your normal `npm run dev` is unchanged and still uses `.env` (Supabase).

## Accounts (password `12345678` for all)

| Role | Email |
|---|---|
| Event Coordinator | `coordinator@connectsphere.local` |
| Technical Support Staff | `tech@connectsphere.local` |
| Venue Staff | `venue@connectsphere.local` |
| Event Organiser | `organiser@connectsphere.local` |
| Second Coordinator | `coordinator2@connectsphere.local` |
| Attendee | `attendee@connectsphere.local` |
| Coordinator Lead / Safety Officer | `lead@…` / `safety@connectsphere.local` |

## Demo data (see `prisma/seed-demo.ts`)

Dates and times are fixed, in Singapore time (+08:00).

- **Robotics Showcase 2027**: Planning, **120 attendees**, 10 Mar 2027 09:00–17:00.
- **Flow 1, venue suitability:** Seminar Room B (**80**) is not suitable.
  Lecture Theatre 1 (**120**, exactly equal) is suitable. Main Auditorium (200) is suitable.
- **Flow 2, equipment:** Projector 4 in stock, 3 committed to Alumni Evening at an
  overlapping time, so **exactly 1 free**. Committing 1 succeeds; committing 2 is refused.
- **Flow 3, booking conflict:** Main Auditorium is **approved** for Alumni Evening
  13:00–20:00. A request for 09:00–17:00 is blocked. A request for 09:00–13:00
  (touching the edge) is allowed.

## Never

- Never run `npx prisma migrate reset` yourself for the demo — use `npm run demo:reset`.
- Never put a Supabase address in `.env.demo`.

## Running the generated tests (`demo-tests/`)

Agent-generated `.spec.ts` files go in `demo-tests/tests/`. The runner uses
your installed Google Chrome; there's no extra browser download.

```bash
cd demo-tests && npm install      # once
npm test                          # from demo-tests/, while `npm run dev:demo` runs
npm run test:headed               # same, with a visible browser
npm run report                    # open the HTML report of the last run
```

Run `npm run demo:reset` before each test run. A test should **pass** with
`w10_demo` running and **fail** with `w10_demo-bugs` running. A test that
passes on both is useless.

`tests/smoke.spec.ts` checks the setup itself. It should pass on both branches.
