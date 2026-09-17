import { describe, expect, it } from 'vitest';
import { AiAssistanceConfigService } from './ai-assistance-config.service';

describe('AiAssistanceConfigService', () => {
  it('desabilitado por padrão quando a flag está off — mesmo sem checar credencial', () => {
    const service = new AiAssistanceConfigService({
      aiAssistanceEnabled: false,
      aiProviderApiKey: undefined,
      aiAssistanceTimeoutMs: 8000,
    });

    expect(service.enabled).toBe(false);
    expect(service.isProviderConfigured).toBe(false);
  });

  it('isProviderConfigured é false quando AI_PROVIDER_API_KEY está ausente — o estado real hoje', () => {
    const service = new AiAssistanceConfigService({
      aiAssistanceEnabled: true,
      aiProviderApiKey: undefined,
      aiAssistanceTimeoutMs: 8000,
    });

    expect(service.isProviderConfigured).toBe(false);
  });

  it('isProviderConfigured é false para string vazia/whitespace', () => {
    const service = new AiAssistanceConfigService({
      aiAssistanceEnabled: true,
      aiProviderApiKey: '   ',
      aiAssistanceTimeoutMs: 8000,
    });

    expect(service.isProviderConfigured).toBe(false);
  });

  it('isProviderConfigured é true quando uma chave não vazia existe', () => {
    const service = new AiAssistanceConfigService({
      aiAssistanceEnabled: true,
      aiProviderApiKey: 'fake-key-for-test-only',
      aiAssistanceTimeoutMs: 8000,
    });

    expect(service.isProviderConfigured).toBe(true);
  });

  it('expõe o timeout configurado', () => {
    const service = new AiAssistanceConfigService({
      aiAssistanceEnabled: true,
      aiProviderApiKey: 'k',
      aiAssistanceTimeoutMs: 1234,
    });

    expect(service.timeoutMs).toBe(1234);
  });
});
