import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { OutboxService } from './outbox.service';
import { OutboxRelayService } from './outbox-relay.service';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [OutboxService, OutboxRelayService],
  exports: [OutboxService, OutboxRelayService],
})
export class EventsModule {}
