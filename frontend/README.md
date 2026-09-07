# ConnectSphere — Frontend

React + TypeScript client for the ConnectSphere event management API.

First pass scope: a login screen and **one dashboard per role**, to establish
the visual direction and the app shell. Sub-screens are deliberately not built.

## Running it

The frontend needs the API running. From the repository root:

```bash
# 1. Once per machine
pg_ctl -D /opt/homebrew/var/postgresql@18 start   # or: brew services start postgresql@18
npm install && npm --prefix frontend install
npm run prisma:migrate                            # apply migrations
npm run prisma:seed                               # one user per role + sample events

# 2. Every day — API on :3000 and frontend on :5173, together
npm run dev
```

`npm run dev` runs both with colour-coded, prefixed output (`[api]`, `[web]`).
Ctrl-C stops both. To run just one, use `npm run start:dev` or
`npm run dev:web`.

Then open http://localhost:5173.

### Seeded logins

All five accounts use the password `12345678`:

| Email | Role | Lands on |
|---|---|---|
| `organiser@connectsphere.local` | Event Organiser | `/organiser` |
| `coordinator@connectsphere.local` | Event Coordinator | `/coordinator` |
| `venue@connectsphere.local` | Venue Staff | `/venues` |
| `tech@connectsphere.local` | Technical Support | `/equipment` |
| `attendee@connectsphere.local` | Attendee | `/events` |

Seed data is for local development only.

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_URL` | Base URL of the API, no trailing slash | `http://localhost:3000` |

Copy `.env.example` to `.env`. No secrets belong in this repo — the JWT is
issued by the API at runtime and held in the browser.

The API must allow this origin. The backend reads `WEB_ORIGIN` (defaults to
`http://localhost:5173`).

## Which screens are real, and which are mocked

| Screen | Data source | Status |
|---|---|---|
| Login | `POST /auth/login` | **Real** |
| Logout | `POST /auth/logout` (revokes the token server-side) | **Real** |
| Organiser — my requests | `GET /events` | **Real** |
| Coordinator — review queue | `GET /events` | **Real** |
| Attendee — browse events | `GET /events` | **Real** |
| Venue Staff — catalogue | `venuesApi` mock | **Mocked** — no `GET /venues` yet (E4) |
| Technical Support — requests + inventory | `equipmentApi` mock | **Mocked** — no equipment endpoints yet (E6) |
| Attendee — register / withdraw | none | **Inert** — no registration endpoints yet (E7) |

Mocked surfaces render a visible amber notice naming the missing endpoint, so
mocked data is never mistaken for real data in a demo.

`GET /events` is one endpoint serving three dashboards: the backend scopes the
result to the caller (organiser → own, coordinator → assigned, attendee →
public projection with internal planning fields stripped). The client sends the
same request in all three cases.

### Swapping a mock for the real thing

Each mock lives in exactly one file and exports the same shape the real client
will. To go live, replace the body of `features/<x>/api/<x>.api.ts` with axios
calls and flip its `*_ENDPOINT_READY` flag to `true`. Hooks, components and
types stay untouched.

## Structure

```
src/
├── components/
│   ├── layout/        app shell, role-adaptive nav, user menu
│   └── ui/            badge, button, card, input, states, logo
├── features/
│   ├── auth/          api, context, useAuth, ProtectedRoute
│   ├── events/        api (real), useEvents, status badge
│   ├── venues/        api (mock), useVenues
│   ├── equipment/     api (mock), useEquipment
│   └── registrations/ api (mock), useMyRegistrations
├── lib/               api client, token store, query client, status vocabulary
├── pages/             login + five dashboards
└── types/api.ts       every API shape, defined once
```

Data fetching lives in hooks; pages and components stay presentational. API
shapes are never redeclared inside a component.

## Design tokens

The palette is declared once in `src/index.css` under `@theme`. Components
reference tokens (`bg-brand-600`, `text-ink-500`) — never raw hex.

- **Brand — Sphere Indigo** (`--color-brand-*`): navigation, primary actions.
- **Accent — Meridian Teal** (`--color-accent-*`): secondary emphasis. Kept
  outside the status palette so an accent can never read as a state.
- **Neutrals — Ink** (`--color-ink-*`): text, borders, surfaces.

Status colours follow the backend `EventStatus` enum exactly and are mapped in
`src/lib/status.ts`. Colour never carries meaning alone — every badge shows its
label too.

## Accessibility

- Single visible focus ring on every interactive element; never removed.
- Skip-to-content link, landmark regions, labelled nav.
- Tables have captions and scoped headers; badges announce "Status: …".
- Menus close on `Escape` and outside click; `aria-expanded` reflects state.
- `prefers-reduced-motion` respected.
- Decorative brand panel hidden from assistive tech.

## Known trade-offs

- **The token is in `localStorage`**, so an XSS could read it. The alternative
  is an httpOnly cookie, which needs backend cookie + CSRF support that does
  not exist today. Revisit before production.
- **The JWT is decoded, not verified, in the browser** — only to decide which
  dashboard to show. The server re-validates every request.
- **Route guards are navigation hygiene, not security.** The API enforces the
  permission matrix; a user who reaches the wrong route still sees nothing.
- **The user menu shows the email typed at login**, because the API exposes no
  name or email (`GET /auth/me` returns `userId`, `role`, `jti`, `exp`). It is
  lost if a session is restored from a token alone.
- **The left nav is hardcoded per role** in `nav-config.ts`. Driving it from
  `GET /auth/me/permissions` would make the menu and the server's rules derive
  from one table — worth doing when there are more screens to gate.
