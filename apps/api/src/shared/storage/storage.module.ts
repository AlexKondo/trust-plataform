import { Global, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.service';
import { EvidenceStorageService } from './evidence-storage.service';
import {
  InMemoryEvidenceStorageService,
  SupabaseEvidenceStorageService,
} from './supabase-evidence-storage.service';

/**
 * PACK-03 §13 — o transporte de evidências passa a ser do shared kernel, porque
 * dois domínios diferentes (Verification e Trust Change Order) precisam dele
 * sem que um dependa do outro. Cada domínio continua dono da sua tabela de
 * metadados e do seu bucket.
 */
@Global()
@Module({
  providers: [
    {
      // Supabase Storage quando configurado; memória em testes/CI
      provide: EvidenceStorageService,
      inject: [AppConfigService, PinoLogger],
      useFactory: (config: AppConfigService, logger: PinoLogger) =>
        config.supabaseUrl && config.supabaseServiceRoleKey
          ? new SupabaseEvidenceStorageService(config, logger)
          : new InMemoryEvidenceStorageService(),
    },
  ],
  exports: [EvidenceStorageService],
})
export class StorageModule {}
