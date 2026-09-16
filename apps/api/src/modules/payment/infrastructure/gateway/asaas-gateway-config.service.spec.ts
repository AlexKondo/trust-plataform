import { describe, expect, it } from 'vitest';
import { AsaasGatewayConfigService } from './asaas-gateway-config.service';

describe('AsaasGatewayConfigService', () => {
  it('não está configurado quando ASAAS_API_KEY está ausente — o estado real hoje', () => {
    const service = new AsaasGatewayConfigService({
      asaasApiKey: undefined,
      asaasEnvironment: 'sandbox',
      asaasWebhookToken: undefined,
    });

    expect(service.isConfigured).toBe(false);
  });

  it('não está configurado quando ASAAS_API_KEY é string vazia/whitespace', () => {
    const service = new AsaasGatewayConfigService({
      asaasApiKey: '   ',
      asaasEnvironment: 'sandbox',
      asaasWebhookToken: undefined,
    });

    expect(service.isConfigured).toBe(false);
  });

  it('está configurado quando uma API key não vazia existe', () => {
    const service = new AsaasGatewayConfigService({
      asaasApiKey: 'fake-key-for-test-only',
      asaasEnvironment: 'sandbox',
      asaasWebhookToken: undefined,
    });

    expect(service.isConfigured).toBe(true);
  });

  it('webhookTokenConfigured segue a mesma regra de presença não vazia', () => {
    const withToken = new AsaasGatewayConfigService({
      asaasApiKey: 'k',
      asaasEnvironment: 'sandbox',
      asaasWebhookToken: 'tok',
    });
    const withoutToken = new AsaasGatewayConfigService({
      asaasApiKey: 'k',
      asaasEnvironment: 'sandbox',
      asaasWebhookToken: undefined,
    });

    expect(withToken.webhookTokenConfigured).toBe(true);
    expect(withoutToken.webhookTokenConfigured).toBe(false);
  });

  it('baseUrl aponta para sandbox ou produção conforme o ambiente configurado', () => {
    const sandbox = new AsaasGatewayConfigService({
      asaasApiKey: 'k',
      asaasEnvironment: 'sandbox',
      asaasWebhookToken: undefined,
    });
    const production = new AsaasGatewayConfigService({
      asaasApiKey: 'k',
      asaasEnvironment: 'production',
      asaasWebhookToken: undefined,
    });

    expect(sandbox.baseUrl).toBe('https://sandbox.asaas.com/api/v3');
    expect(production.baseUrl).toBe('https://api.asaas.com/v3');
  });
});
