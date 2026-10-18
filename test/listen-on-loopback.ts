import { INestApplication } from '@nestjs/common';

/**
 * Start the e2e app on 127.0.0.1, on a port the OS confirms is free there.
 *
 * Use this instead of `app.init()`. Given a server that is not listening,
 * supertest calls `listen(0)` for every request — the wildcard address — and
 * then connects to 127.0.0.1:<port>. On macOS the wildcard bind succeeds even
 * when another program (an editor helper, a local AI server…) already holds
 * 127.0.0.1 on that port, and the request goes to that program instead: a
 * random 404, 401 or "socket hang up" in an unrelated test.
 *
 * Binding 127.0.0.1:0 can only be given a port free on 127.0.0.1, and
 * supertest then reuses this one server for every request. `app.close()`
 * in afterAll stops it.
 */
export async function listenOnLoopback(app: INestApplication): Promise<void> {
  await app.listen(0, '127.0.0.1');
}
