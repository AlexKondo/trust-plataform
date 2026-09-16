import { Injectable } from '@nestjs/common';

/**
 * Formato mínimo que este serviço precisa de quem carrega a configuração —
 * um subconjunto estrutural de `AppConfigService` (duck typing), para que os
 * testes não precisem montar um `ConfigService`/`AppConfigService` completo
 * só para exercitar "configurado" vs "não configurado".
 */
export interface AsaasEnvConfig {
  readonly asaasApiKey: string | undefined;
  readonly asaasEnvironment: 'sandbox' | 'production';
  readonly asaasWebhookToken: string | undefined;
}

/**
 * IP-009 — resolve se o adapter Asaas tem o mínimo de configuração para
 * tentar operar. "Configurado" NÃO significa "verificado contra a API real"
 * (ver `AsaasIntegrationNotVerifiedException`) — só significa que existe uma
 * credencial no ambiente.
 */
@Injectable()
export class AsaasGatewayConfigService {
  constructor(private readonly env: AsaasEnvConfig) {}

  get isConfigured(): boolean {
    return Boolean(this.env.asaasApiKey && this.env.asaasApiKey.trim().length > 0);
  }

  get environment(): 'sandbox' | 'production' {
    return this.env.asaasEnvironment;
  }

  get webhookTokenConfigured(): boolean {
    return Boolean(this.env.asaasWebhookToken && this.env.asaasWebhookToken.trim().length > 0);
  }

  /**
   * Base da API pública do Asaas — estável e de baixo risco mesmo sem
   * verificação (é só a URL, não um shape de payload): produção
   * `api.asaas.com`, sandbox `sandbox.asaas.com`. Confirmar contra a
   * documentação oficial antes de qualquer chamada real.
   */
  get baseUrl(): string {
    return this.environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';
  }
}
