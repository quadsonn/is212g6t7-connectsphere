import { INestApplication, ValidationPipe } from '@nestjs/common';

import { UnauthorizedFilter } from './common/filters/unauthorized.filter';

/**
 * The app-wide setup shared by main.ts and the integration tests, so the app
 * under test can't drift from the one in production. Listening (port and
 * host) stays with each caller.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalFilters(new UnauthorizedFilter());
  // The browser client is served from a different origin in every
  // environment; the allowed origin is configuration, never a wildcard.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  return app;
}
