import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  // app.close() runs this, so each test app releases its connections instead
  // of holding them for the rest of the run.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
