import type { APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Shared helpers for the demo specs. Not a spec file itself, so specs can
 * import it freely.
 */

// Saved by auth.setup.ts and loaded by every browser test (see config), so
// tests start already logged in instead of going through the login form.
export const COORDINATOR_STATE = path.join(__dirname, '..', '.auth', 'coordinator.json');

export const COORDINATOR = {
  email: 'coordinator@connectsphere.local',
  password: '12345678',
};

/** The Coordinator's JWT, read back from the saved login. */
export function coordinatorToken(): string {
  const state = JSON.parse(readFileSync(COORDINATOR_STATE, 'utf8'));
  const item = state.origins[0].localStorage.find(
    (i: { name: string }) => i.name === 'connectsphere.token',
  );
  return item.value;
}

export function authHeaders() {
  return { Authorization: `Bearer ${coordinatorToken()}` };
}

export type SeedIds = {
  events: Record<string, string>;
  venues: Record<string, string>;
};

let cached: SeedIds | undefined;

/**
 * IDs change on every `npm run demo:reset`, so look them up by name rather
 * than hard-coding them. Cached once per worker.
 */
export async function seedIds(request: APIRequestContext): Promise<SeedIds> {
  if (cached) return cached;
  const headers = authHeaders();
  const [events, venues] = await Promise.all([
    request.get('/api/events', { headers }).then((r) => r.json()),
    request.get('/api/venues', { headers }).then((r) => r.json()),
  ]);
  const byName = (rows: { id: string; name: string }[]) =>
    Object.fromEntries(rows.map((r) => [r.name, r.id]));
  cached = { events: byName(events), venues: byName(venues) };
  return cached;
}
