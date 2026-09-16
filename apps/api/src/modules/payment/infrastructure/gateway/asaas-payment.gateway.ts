import { PinoLogger } from 'nestjs-pino';
import {
  AsaasIntegrationNotVerifiedException,
  AsaasNotConfiguredException,
} from '../../domain/exceptions/asaas.exceptions';
import {
  AuthorizationResult,
  AuthorizeRequest,
  CancelRequest,
  CancelResult,
  CaptureRequest,
  CaptureResult,
  PaymentGateway,
  PaymentStatusResult,
  RefundRequest,
  RefundResult,
  ReleaseRequest,
  ReleaseResult,
} from '../../domain/services/payment-gateway';
import { AsaasGatewayConfigService } from './asaas-gateway-config.service';

/**
 * Adapter real do Asaas (IP-009) — CONTRATO/ESQUELETO, não integração viva.
 *
 * Por que este arquivo existe sem chamar a API do Asaas de verdade:
 * `04_APPROVED_PRODUCT_DECISIONS.md` autoriza o Asaas como provedor
 * pretendido, mas `00_READ_FIRST...md` §7 e a IP-009 §4 proíbem
 * explicitamente inventar comportamento real de PSP. Nenhuma credencial
 * Asaas (`ASAAS_API_KEY`) existe em nenhum ambiente deste repositório
 * (confirmado: `env.schema.ts`/`.env.example` não têm nenhuma chave Asaas
 * até esta IP) — ver `IP-009-CONFLICT-ESCALATION-ASAAS-ACCOUNT-CREDENTIALS.md`.
 *
 * Este adapter implementa o PORT `PaymentGateway` byte a byte (mesmo shape
 * que `SandboxPaymentGateway`), para que:
 * - o contrato exista e seja testável hoje (idempotência, port shape);
 * - trocar de provedor no futuro seja só trocar o binding no módulo —
 *   NENHUMA entidade/use case muda quando este adapter for completado.
 *
 * Duas verificações, nesta ordem, antes de qualquer chamada HTTP real:
 * 1. `AsaasGatewayConfigService.isConfigured` — existe uma API key?
 * 2. Ainda que exista, o mapeamento de campos request/response desta
 *    operação contra a API real do Asaas nunca foi confirmado contra
 *    documentação oficial + conta sandbox real → `AsaasIntegrationNotVerifiedException`.
 *
 * NÃO adicionar aqui nomes de campo/shape de payload "prováveis" do Asaas
 * (ex.: billingType, customer, split[], walletId) sem antes confirmar contra
 * a documentação oficial vigente E uma conta sandbox real — isso é
 * exatamente o tipo de invenção que este programa proíbe.
 *
 * Este adapter NÃO está registrado em `payment.module.ts` — não é a
 * implementação ativa de `PaymentGateway` (isso continua sendo
 * `SandboxPaymentGateway`) e não é selecionável por `PaymentProviderResolver`.
 */
export class AsaasPaymentGateway extends PaymentGateway {
  readonly providerId = 'asaas';

  constructor(
    private readonly config: AsaasGatewayConfigService,
    private readonly logger?: PinoLogger,
  ) {
    super();
    this.logger?.setContext(AsaasPaymentGateway.name);
  }

  authorize(_request: AuthorizeRequest): Promise<AuthorizationResult> {
    return this.rejectUnverified('authorize');
  }

  capture(_request: CaptureRequest): Promise<CaptureResult> {
    return this.rejectUnverified('capture');
  }

  refund(_request: RefundRequest): Promise<RefundResult> {
    return this.rejectUnverified('refund');
  }

  cancel(_request: CancelRequest): Promise<CancelResult> {
    return this.rejectUnverified('cancel');
  }

  /**
   * PACK-01 §12 — liberar custódia. Além de tudo acima: o modelo real do
   * Asaas para "soltar dinheiro para o prestador" (split de pagamento vs.
   * transferência para subconta vs. saque manual) depende do tipo de
   * conta/plano contratado — nunca assumir capacidade de split sem
   * confirmação (IP-009 §4 "não inventar capacidade de split").
   */
  release(_request: ReleaseRequest): Promise<ReleaseResult> {
    return this.rejectUnverified('release');
  }

  getStatus(_providerTransactionId: string): Promise<PaymentStatusResult> {
    return this.rejectUnverified('getStatus');
  }

  /**
   * Chave de idempotência de saída (padrão do port, ADR §9 — ver
   * `payment-gateway.ts`): todo request real deveria carregar
   * `request.idempotencyKey` como cabeçalho de idempotência. O NOME exato do
   * header que o Asaas realmente respeita não foi confirmado — este helper
   * documenta a convenção REST padrão (`Idempotency-Key`) para quando a
   * chamada real for implementada, mas não é usado hoje porque nenhuma
   * chamada HTTP é feita por este adapter ainda.
   */
  protected buildIdempotencyHeaders(idempotencyKey: string): Record<string, string> {
    return {
      // Convenção REST comum — confirmar se o Asaas realmente a respeita
      // antes de depender dela para deduplicação do lado do provedor.
      'Idempotency-Key': idempotencyKey,
    };
  }

  /**
   * Devolve SEMPRE uma promise rejeitada — nunca lança de forma síncrona —
   * para que o método continue seguro de usar tanto com `await` quanto
   * encadeado com `.catch()`, exatamente como o resto do port assume
   * (`SandboxPaymentGateway` também nunca lança de forma síncrona).
   */
  private rejectUnverified<T>(operation: string): Promise<T> {
    if (!this.config.isConfigured) {
      return Promise.reject(new AsaasNotConfiguredException(operation));
    }
    return Promise.reject(new AsaasIntegrationNotVerifiedException(operation));
  }
}
