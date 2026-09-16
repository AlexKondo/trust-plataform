import { Injectable } from '@nestjs/common';
import { AsaasWebhookSignatureVerifier } from '../../domain/services/asaas-webhook-signature.verifier';

/**
 * IP-009 — implementação ÚNICA hoje do port `AsaasWebhookSignatureVerifier`:
 * um stub fail-closed deliberado.
 *
 * Por que fail-closed, não fail-open: o esquema real de autenticação de
 * webhook do Asaas (header de token estático configurado no painel? HMAC
 * sobre o corpo? qual corpo exatamente?) não foi confirmado contra
 * documentação oficial nem uma conta real (ver
 * `IP-009-CONFLICT-ESCALATION-ASAAS-ACCOUNT-CREDENTIALS.md`). Inventar um
 * esquema plausível e aceitar payloads "verificados" por ele seria pior do
 * que rejeitar tudo — processaria dado externo não autenticado como fato
 * financeiro. Este stub sempre devolve `false`.
 *
 * Substituir por uma implementação real é o único trabalho que uma IP futura
 * precisa fazer aqui — nenhum outro código deste módulo muda.
 */
@Injectable()
export class UnverifiedAsaasWebhookSignatureVerifier extends AsaasWebhookSignatureVerifier {
  verify(
    _rawBody: string,
    _headers: Readonly<Record<string, string | string[] | undefined>>,
  ): boolean {
    return false;
  }
}
