import { Module } from '@nestjs/common';

import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

/**
 * E4 — catalogue, availability, search/filter, suitability.
 * US-13 adds the catalogue and its draft/publish lifecycle.
 */
@Module({
  imports: [],
  controllers: [VenuesController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
