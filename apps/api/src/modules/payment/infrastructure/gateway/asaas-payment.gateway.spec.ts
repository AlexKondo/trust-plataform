import { describe, expect, it } from 'vitest';
import {
  AsaasIntegrationNotVerifiedException,
  AsaasNotConfiguredException,
} from '../../domain/exceptions/asaas.exceptions';
import { AsaasGatewayConfigService } from './asaas-gateway-config.service';
import { AsaasPaymentGateway } from './asaas-payment.gateway';

const baseContext = { idempotencyKey: 'idem-1', correlationId: 'corr-1' };

function notConfiguredGateway(): AsaasPaymentGateway {
  const config = new AsaasGatewayConfigService({
    asaasApiKey: undefined,
    asaasEnvironment: 'sandbox',
    asaasWebhookToken: undefined,
  });
  return new AsaasPaymentGateway(config);
}

function configuredGateway(): AsaasPaymentGateway {
  const config = new AsaasGatewayConfigService({
    asaasApiKey: 'fake-key-for-test-only',
    asaasEnvironment: 'sandbox',
    asaasWebhookToken: undefined,
  });
  return new AsaasPaymentGateway(config);
}

describe('AsaasPaymentGateway', () => {
  it('providerId é "asaas" — o identificador estável que iria para payments.payment_provider_id', () => {
    expect(notConfiguredGateway().providerId).toBe('asaas');
  });

  describe('sem ASAAS_API_KEY (o estado real em todo ambiente hoje)', () => {
    const gateway = notConfiguredGateway();

    it('authorize rejeita com AsaasNotConfiguredException', async () => {
      await expect(
        gateway.authorize({
          ...baseContext,
          paymentId: 'p1',
          amountCents: 1000,
          currency: 'BRL',
          paymentMethodToken: null,
        }),
      ).rejects.toBeInstanceOf(AsaasNotConfiguredException);
    });

    it('capture rejeita com AsaasNotConfiguredException', async () => {
      await expect(
        gateway.capture({ ...baseContext, providerTransactionId: 't1', amountCents: 1000 }),
      ).rejects.toBeInstanceOf(AsaasNotConfiguredException);
    });

    it('refund rejeita com AsaasNotConfiguredException', async () => {
      await expect(
        gateway.refund({
          ...baseContext,
          providerTransactionId: 't1',
          amountCents: 1000,
          reason: 'test',
        }),
      ).rejects.toBeInstanceOf(AsaasNotConfiguredException);
    });

    it('cancel rejeita com AsaasNotConfiguredException', async () => {
      await expect(
        gateway.cancel({ ...baseContext, providerTransactionId: 't1' }),
      ).rejects.toBeInstanceOf(AsaasNotConfiguredException);
    });

    it('release rejeita com AsaasNotConfiguredException', async () => {
      await expect(
        gateway.release({
          ...baseContext,
          paymentId: 'p1',
          custodyId: 'c1',
          amountCents: 1000,
          currency: 'BRL',
          providerTransactionId: 't1',
        }),
      ).rejects.toBeInstanceOf(AsaasNotConfiguredException);
    });

    it('getStatus rejeita com AsaasNotConfiguredException', async () => {
      await expect(gateway.getStatus('t1')).rejects.toBeInstanceOf(AsaasNotConfiguredException);
    });
  });

  describe('com ASAAS_API_KEY presente — ainda assim nenhuma chamada real é feita', () => {
    const gateway = configuredGateway();

    it('authorize rejeita com AsaasIntegrationNotVerifiedException, não faz nenhuma chamada HTTP', async () => {
      await expect(
        gateway.authorize({
          ...baseContext,
          paymentId: 'p1',
          amountCents: 1000,
          currency: 'BRL',
          paymentMethodToken: null,
        }),
      ).rejects.toBeInstanceOf(AsaasIntegrationNotVerifiedException);
    });

    it('release rejeita com AsaasIntegrationNotVerifiedException mesmo configurado', async () => {
      await expect(
        gateway.release({
          ...baseContext,
          paymentId: 'p1',
          custodyId: 'c1',
          amountCents: 1000,
          currency: 'BRL',
          providerTransactionId: 't1',
        }),
      ).rejects.toBeInstanceOf(AsaasIntegrationNotVerifiedException);
    });

    it('getStatus rejeita com AsaasIntegrationNotVerifiedException mesmo configurado', async () => {
      await expect(gateway.getStatus('t1')).rejects.toBeInstanceOf(
        AsaasIntegrationNotVerifiedException,
      );
    });
  });
});
