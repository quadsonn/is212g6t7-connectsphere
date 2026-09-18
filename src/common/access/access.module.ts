import { Global, Module } from '@nestjs/common';

import { AccessControlService } from './access-control.service';

/**
 * Global so every domain module can enforce ownership without re-providing
 * the helper (CLAUDE.md §3.3 — authorisation is central, not scattered).
 */
@Global()
@Module({
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessModule {}
