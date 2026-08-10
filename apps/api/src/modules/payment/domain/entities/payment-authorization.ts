import { v7 as uuidv7 } from 'uuid';
import { Cents } from '../../../../shared/money/money';
import { AuthorizationResult } from '../services/payment-gateway';
import { AUTHORIZATION_STATUS, AuthorizationStatus } from './payment-types';

export interface PaymentAuthorizationProps {
  id: string;
  paymentId: string;
  providerId: string;
  idempotencyKey: string;
  providerTransactionId: string | null;
  authorizationCode: string | null;
  authorizedAmountCents: Cents;
  status: AuthorizationStatus;
  providerCode: string | null;
  message: string | null;
  authorizedAt: Date | null;
  expiresAt: Date | null;
  gatewayResponse: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Tentativa de autorização (PAY-002).
 *
 * É um registro **imutável**: cada tentativa gera uma linha nova (BR-003), e o
 * histórico completo alimenta auditoria e reconciliação (BR-006). O que muda de
 * status é o `Payment`, não a tentativa.
 */
export class PaymentAuthorization {
  private constructor(private readonly props: PaymentAuthorizationProps) {}

  /** Traduz o resultado do gateway em registro de domínio. */
  static fromGatewayResult(input: {
    paymentId: string;
    providerId: string;
    idempotencyKey: string;
    result: AuthorizationResult;
    now?: Date;
  }): PaymentAuthorization {
    const now = input.now ?? new Date();
    const approved = input.result.outcome === 'APPROVED';
    return new PaymentAuthorization({
      id: uuidv7(),
      paymentId: input.paymentId,
      providerId: input.providerId,
      idempotencyKey: input.idempotencyKey,
      providerTransactionId: input.result.providerTransactionId,
      authorizationCode: input.result.authorizationCode,
      authorizedAmountCents: input.result.authorizedAmountCents,
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

  static restore(props: PaymentAuthorizationProps): PaymentAuthorization {
    return new PaymentAuthorization(props);
  }

  get id(): string {
    return this.props.id;
  }

  get paymentId(): string {
    return this.props.paymentId;
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

  get authorizedAmountCents(): Cents {
    return this.props.authorizedAmountCents;
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

  toProps(): PaymentAuthorizationProps {
    return { ...this.props };
  }
}

/**
 * Remove qualquer campo de instrumento de pagamento antes de persistir
 * (PAY-ARCH-001 §13). Guardar a resposta do provedor é exigido para auditoria;
 * guardar cartão, nunca.
 */
const FORBIDDEN_KEYS = [
  'cvv',
  'cvc',
  'securitycode',
  'pan',
  'cardnumber',
  'card_number',
  'number',
  'expiry',
  'exp_month',
  'exp_year',
  'token',
];

export function sanitize(raw: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase().replace(/[^a-z_]/g, ''))) {
      continue;
    }
    clean[key] =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? sanitize(value as Record<string, unknown>)
        : value;
  }
  return clean;
}
