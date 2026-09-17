import { Injectable } from '@nestjs/common';

/**
 * Formato mínimo que este serviço precisa de quem carrega a configuração —
 * mesmo duck-typing usado por `AsaasEnvConfig`
 * (`apps/api/src/modules/payment/infrastructure/gateway/asaas-gateway-config.service.ts`),
 * para que testes não precisem montar um `AppConfigService` completo.
 */
export interface AiAssistanceEnvConfig {
  /** Feature flag — default OFF. Ausência/`'false'` desliga toda a camada de IA. */
  readonly aiAssistanceEnabled: boolean;
  readonly aiProviderApiKey: string | undefined;
  readonly aiAssistanceTimeoutMs: number;
}

/**
 * IP-019 — resolve se a camada de assistência por IA está ligada E se existe
 * credencial mínima de provedor. As duas perguntas são independentes de
 * propósito (mesmo padrão do `AsaasGatewayConfigService`):
 * - `enabled` é a feature flag de produto — pode estar `true` sem nenhuma
 *   credencial (o caller ainda cai no fail-closed `PROVIDER_NOT_CONFIGURED`).
 * - `isProviderConfigured` é só "existe uma API key não vazia no ambiente".
 *   Hoje, em todo ambiente, é sempre `false` — nenhuma `AI_PROVIDER_API_KEY`
 *   existe (ver `.env.example`).
 */
@Injectable()
export class AiAssistanceConfigService {
  constructor(private readonly env: AiAssistanceEnvConfig) {}

  get enabled(): boolean {
    return this.env.aiAssistanceEnabled;
  }

  get isProviderConfigured(): boolean {
    return Boolean(this.env.aiProviderApiKey && this.env.aiProviderApiKey.trim().length > 0);
  }

  get timeoutMs(): number {
    return this.env.aiAssistanceTimeoutMs;
  }
}
