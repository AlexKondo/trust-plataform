import { describe, expect, it } from 'vitest';
import {
  AsaasIntegrationNotVerifiedException,
  AsaasWebhookSignatureInvalidException,
} from '../../domain/exceptions/asaas.exceptions';
import { AsaasWebhookSignatureVerifier } from '../../domain/services/asaas-webhook-signature.verifier';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { UnverifiedAsaasWebhookSignatureVerifier } from './unverified-asaas-webhook-signature.verifier';

class AlwaysVerifiedStub extends AsaasWebhookSignatureVerifier {
  verify(): boolean {
    return true;
  }
}

describe('AsaasWebhookController', () => {
  it('rejeita com AsaasWebhookSignatureInvalidException quando o verificador (stub real, fail-closed) recusa', async () => {
    const controller = new AsaasWebhookController(new UnverifiedAsaasWebhookSignatureVerifier());

    await expect(
      controller.receive({ event: 'PAYMENT_CONFIRMED' }, {}),
    ).rejects.toBeInstanceOf(AsaasWebhookSignatureInvalidException);
  });

  it('nunca processa o evento como fato mesmo se um verificador hipotético aprovasse — o parsing em si ainda não existe', async () => {
    // Prova que a recusa de hoje não depende só do stub: mesmo trocando por um
    // verificador que SEMPRE aprova, o controller ainda não inventa parsing de
    // evento — ele para em AsaasIntegrationNotVerifiedException.
    const controller = new AsaasWebhookController(new AlwaysVerifiedStub());

    await expect(
      controller.receive({ event: 'PAYMENT_CONFIRMED' }, {}),
    ).rejects.toBeInstanceOf(AsaasIntegrationNotVerifiedException);
  });
});
