/**
 * Dev-only: run the registration-window notice sweeps once, on demand, instead
 * of waiting for the every-minute scheduler. Sends any opens / closes /
 * near-capacity notices that are currently due and prints which events fired.
 *
 * Pair it with the seed:  npm run prisma:seed:notices  arms the events, then
 * this fires them immediately — handy for a quick loop, or when the API is not
 * running.
 *
 * LOCAL DATABASES ONLY — refuses to run unless DATABASE_URL points at
 * localhost, so it can never touch the shared Supabase database.
 *
 * Usage:
 *   npm run notices:trigger
 */
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { RegistrationNotificationsService } from '../src/registrations/registration-notifications.service';

function assertLocalDatabase(): void {
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const value = process.env[name];
    if (!value) continue;
    const host = new URL(value).hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(
        `${name} points at "${host}", not localhost. This script only runs ` +
          'against a local database.',
      );
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }
}

async function main(): Promise<void> {
  assertLocalDatabase();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const notices = app.get(RegistrationNotificationsService);
    const opened = await notices.notifyOpened();
    const closed = await notices.notifyClosed();
    const nearCapacity = await notices.notifyNearCapacity();

    const line = (label: string, ids: string[]) =>
      `  ${label.padEnd(13)}→ ${ids.length ? ids.join(', ') : '(none due)'}`;

    console.log('Registration-window notices sent this run:');
    console.log(line('opened', opened));
    console.log(line('closed', closed));
    console.log(line('near-capacity', nearCapacity));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
