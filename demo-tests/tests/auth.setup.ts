import { expect, test as setup } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { COORDINATOR, COORDINATOR_STATE } from './support';

/**
 * Logs in once over the API (no browser) and saves the session the way the
 * web app stores it: the JWT in localStorage. Every browser test then starts
 * already logged in.
 */
setup('log in as the Coordinator', async ({ request, baseURL }) => {
  const res = await request.post('/api/auth/login', { data: COORDINATOR });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = await res.json();

  mkdirSync(path.dirname(COORDINATOR_STATE), { recursive: true });
  writeFileSync(
    COORDINATOR_STATE,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL!).origin,
          localStorage: [
            { name: 'connectsphere.token', value: accessToken },
            { name: 'connectsphere.email', value: COORDINATOR.email },
          ],
        },
      ],
    }),
  );
});
