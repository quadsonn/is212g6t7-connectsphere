import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

/**
 * Scaffold smoke test: proves every module in the map is wired into AppModule
 * and the dependency graph resolves. PrismaService is stubbed so this runs
 * without a database.
 */
describe('AppModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('compiles the dependency graph', () => {
    expect(moduleRef).toBeDefined();
  });
});
