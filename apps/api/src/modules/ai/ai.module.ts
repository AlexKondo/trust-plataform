import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../shared/config/app-config.module';
import { AppConfigService } from '../../shared/config/app-config.service';
import { AuditModule } from '../../shared/audit/audit.module';
import { GenerateAiSuggestionUseCase } from './application/usecases/generate-ai-suggestion.usecase';
import { AiAssistanceConfigService } from './infrastructure/ai-assistance-config.service';
import { NotConfiguredAiAssistanceAdapter } from './infrastructure/not-configured-ai-assistance.adapter';
import { AiAssistancePort } from './domain/ports/ai-assistance.port';

/**
 * IP-019 — módulo da camada de assistência por IA.
 *
 * Trocar o provedor real (quando uma `AI_PROVIDER_API_KEY` existir e o
 * contrato do provedor tiver sido verificado — mesma barra do IP-009) é
 * trocar só o `useClass`/`useFactory` de `AiAssistancePort` aqui. Nenhum
 * outro módulo importa `NotConfiguredAiAssistanceAdapter` diretamente —
 * todos dependem do port.
 */
@Module({
  imports: [AppConfigModule, AuditModule],
  providers: [
    {
      provide: AiAssistanceConfigService,
      useFactory: (appConfig: AppConfigService) =>
        new AiAssistanceConfigService({
          aiAssistanceEnabled: appConfig.aiAssistanceEnabled,
          aiProviderApiKey: appConfig.aiProviderApiKey,
          aiAssistanceTimeoutMs: appConfig.aiAssistanceTimeoutMs,
        }),
      inject: [AppConfigService],
    },
    { provide: AiAssistancePort, useClass: NotConfiguredAiAssistanceAdapter },
    GenerateAiSuggestionUseCase,
  ],
  exports: [GenerateAiSuggestionUseCase, AiAssistanceConfigService],
})
export class AiModule {}
