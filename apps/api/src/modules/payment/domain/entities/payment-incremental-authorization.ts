import { v7 as uuidv7 } from 'uuid';
import { Cents } from '../../../../shared/money/money';
import { AuthorizationResult } from '../services/payment-gateway';
import { sanitize } from './payment-authorization';
import { AUTHORIZATION_STATUS, AuthorizationStatus } from './payment-types';

export interface PaymentIncrementalAuthorizationProps {
  id: string;
  paymentId: string;
  /** O Trust Change Order aprovado que esta tentativa autoriza — 1:1 para sempre. */
  changeOrderId: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  providerId: string;
  idempotencyKey: string;
  providerTransactionId: string | null;
  authorizationCode: string | null;
  /** Sempre o `changeGrossAmount` CONGELADO do Change Order — nunca redigitado. */
  amountCents: Cents;
  currency: string;
  status: AuthorizationStatus;
  providerCode: string | null;
  message: string | null;
  authorizedAt: Date | null;
  expiresAt: Date | null;
  gatewayResponse: Record<string, unknown>;
  createdAt: Date;
}

/**
 * IP-007 — autorização financeira incremental de um Trust Change Order aprovado.
 *
 * Resolve o gap `amountAuthorizedNotInCustody` que o PACK-03 autorreportou e
 * deixou parado (relatório §9.1): o `Payment`/`TrustCustody` do PACK-01 congelam
 * um valor único na contratação e não sabem representar dinheiro adicional. Esta
 * entidade é o registro da tentativa de cobrar o DELTA aprovado, em sandbox,
 * pelo mesmo port `PaymentGateway` que a autorização original usa.
 *
 * Diferença deliberada em relação a `PaymentAuthorization`: aquela é um LOG de
 * tentativas (uma linha nova a cada tentativa, PAY-002 BR-003), porque o
 * comprador pode tentar pagar de novo depois de uma recusa. Aqui não há ação do
 * usuário — o gatilho é `TrustChangeOrder.Approved`, automático e único — então
 * o desenho é "no máximo uma tentativa, para sempre" (UNIQUE(change_order_id) no
 * banco). Uma recusa fica registrada como fato definitivo: reautorizar exigiria
 * uma nova decisão de produto, fora do escopo desta IP (nenhuma reautorização
 * falsa de PSP é inventada aqui).
 */
export class PaymentIncrementalAuthorization {
  private constructor(private readonly props: PaymentIncrementalAuthorizationProps) {}

  static fromGatewayResult(input: {
    paymentId: string;
    changeOrderId: string;
    orderId: string;
    buyerId: string;
    sellerId: string;
    providerId: string;
    idempotencyKey: string;
    /** O delta CONGELADO que foi pedido ao gateway — vale mesmo em recusa. */
    amountCents: Cents;
    currency: string;
    result: AuthorizationResult;
    now?: Date;
  }): PaymentIncrementalAuthorization {
    const now = input.now ?? new Date();
    const approved = input.result.outcome === 'APPROVED';
    return new PaymentIncrementalAuthorization({
      id: uuidv7(),
      paymentId: input.paymentId,
      changeOrderId: input.changeOrderId,
      orderId: input.orderId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      providerId: input.providerId,
      idempotencyKey: input.idempotencyKey,
      providerTransactionId: input.result.providerTransactionId,
      authorizationCode: input.result.authorizationCode,
      amountCents: input.amountCents,
      currency: input.currency,
      status:
        input.result.outcome === 'APPROVED'
          ? AUTHORIZATION_STATUS.APPROVED
          : input.result.outcome === 'DECLINED'
            ? AUTHORIZATION_STATUS.DECLINED
            : AUTHORIZATION_STATUS.ERROR,
      providerCode: input.result.providerCode,
      message: input.result.message,
      authorizedAt: approved ? now : null,
      expiresAt: input.result.expiresAt,
      gatewayResponse: sanitize(input.result.rawResponse),
      createdAt: now,
    });
  }

  static restore(props: PaymentIncrementalAuthorizationProps): PaymentIncrementalAuthorization {
    return new PaymentIncrementalAuthorization(props);
  }

  get id(): string {
    return this.props.id;
  }

  get paymentId(): string {
    return this.props.paymentId;
  }

  get changeOrderId(): string {
    return this.props.changeOrderId;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get buyerId(): string {
    return this.props.buyerId;
  }

  get sellerId(): string {
    return this.props.sellerId;
  }

  get providerId(): string {
    return this.props.providerId;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  get providerTransactionId(): string | null {
    return this.props.providerTransactionId;
  }

  get authorizationCode(): string | null {
    return this.props.authorizationCode;
  }

  get amountCents(): Cents {
    return this.props.amountCents;
  }

  get currency(): string {
    return this.props.currency;
  }

  get status(): AuthorizationStatus {
    return this.props.status;
  }

  get providerCode(): string | null {
    return this.props.providerCode;
  }

  get message(): string | null {
    return this.props.message;
  }

  get authorizedAt(): Date | null {
    return this.props.authorizedAt;
  }

  get expiresAt(): Date | null {
    return this.props.expiresAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  isApproved(): boolean {
    return this.props.status === AUTHORIZATION_STATUS.APPROVED;
  }

  toProps(): PaymentIncrementalAuthorizationProps {
    return { ...this.props };
  }
}
