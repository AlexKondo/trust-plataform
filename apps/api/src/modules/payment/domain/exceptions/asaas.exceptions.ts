import { DomainException } from '../../../../shared/domain/exceptions/domain.exception';

/**
 * IP-009 — exceções do adapter Asaas.
 *
 * Duas condições DIFERENTES levam a exceções diferentes de propósito, porque
 * confundi-las esconderia qual delas o operador precisa resolver:
 *
 * 1. `AsaasNotConfiguredException` — não existe `ASAAS_API_KEY` no ambiente.
 *    Resolve-se com uma conta/credencial real (ação do founder).
 * 2. `AsaasIntegrationNotVerifiedException` — mesmo com credencial presente,
 *    o mapeamento de campos de requisição/resposta contra a API real do
 *    Asaas (nomes de campo, shape de customer/payment, split, status) NUNCA
 *    foi confirmado contra documentação oficial + conta sandbox real. Este
 *    programa proíbe explicitamente inventar comportamento de PSP real
 *    (`00_READ_FIRST...md` §7, `04_APPROVED_PRODUCT_DECISIONS.md`), então o
 *    adapter se recusa a montar/enviar a chamada em vez de arriscar um campo
 *    errado. Resolve-se substituindo esta exceção por uma implementação
 *    verificada, numa IP futura, depois que a credencial + docs existirem.
 *
 * Ver `docs/Multi-Agent Implementation Doc/IPS/IP-009-CONFLICT-ESCALATION-ASAAS-ACCOUNT-CREDENTIALS.md`.
 */
export class AsaasNotConfiguredException extends DomainException {
  readonly code = 'ASAAS_NOT_CONFIGURED';
  override readonly httpStatus = 503;

  constructor(operation: string) {
    super(
      `Asaas payment gateway is not configured (missing ASAAS_API_KEY). Operation "${operation}" cannot be executed. This is expected in every environment today — see IP-009 Conflict Escalation.`,
    );
  }
}

/**
 * Credencial presente, mas o mapeamento de request/response contra a API
 * real do Asaas ainda não foi verificado — ver comentário da classe acima.
 */
export class AsaasIntegrationNotVerifiedException extends DomainException {
  readonly code = 'ASAAS_INTEGRATION_NOT_VERIFIED';
  override readonly httpStatus = 501;

  constructor(operation: string) {
    super(
      `Asaas adapter operation "${operation}" is intentionally not implemented: its request/response field mapping has not been verified against real Asaas API documentation and a live sandbox account. Implementing it without that verification would risk inventing PSP behavior, which this program forbids. See IP-009 Conflict Escalation.`,
    );
  }
}

/**
 * Webhook recebido não passou na verificação de assinatura/token — hoje
 * SEMPRE (o verificador é um stub fail-closed até o esquema real do Asaas
 * ser confirmado). Nunca processamos um payload não verificado como fato.
 */
export class AsaasWebhookSignatureInvalidException extends DomainException {
  readonly code = 'ASAAS_WEBHOOK_SIGNATURE_INVALID';
  override readonly httpStatus = 401;

  constructor() {
    super(
      'Asaas webhook signature/token could not be verified — the verifier is an intentional fail-closed stub pending confirmation of the real Asaas webhook authentication scheme (see IP-009 Conflict Escalation). The payload was rejected, not processed.',
    );
  }
}
