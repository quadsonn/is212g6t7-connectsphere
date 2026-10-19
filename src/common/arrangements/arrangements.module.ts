import { Global, Module } from '@nestjs/common';

import { ArrangementsRegistry } from './arrangements.registry';

/**
 * Global so the bookings, equipment and events modules can signal a change
 * without importing the module that reacts to it. See ArrangementsRegistry.
 */
@Global()
@Module({
  providers: [ArrangementsRegistry],
  exports: [ArrangementsRegistry],
})
export class ArrangementsModule {}
