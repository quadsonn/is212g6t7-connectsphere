import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * Scaffold smoke test: the application bootstraps. PrismaService is stubbed so
 * this runs without a database — story-level e2e tests (CLAUDE.md §10) should
 * instead point at a real test database.
 */
describe('Application (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    await listenOnLoopback(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('boots', () => {
    expect(app).toBeDefined();
  });
});
