import { Global, Module } from '@nestjs/common';
import { DOMAIN_EVENT_PUBLISHER } from '../../core/application/domain-event-publisher.port';
import { InProcessEventPublisher } from './in-process-event.publisher';

/**
 * Global, because publishing is ambient: any module may raise a fact, and none
 * of them should have to import a bus to do it.
 */
@Global()
@Module({
  providers: [
    InProcessEventPublisher,
    { provide: DOMAIN_EVENT_PUBLISHER, useExisting: InProcessEventPublisher },
  ],
  exports: [InProcessEventPublisher, DOMAIN_EVENT_PUBLISHER],
})
export class EventsModule {}
