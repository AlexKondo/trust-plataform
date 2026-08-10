import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
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
} from '../../domain/services/payment-gateway';

/**
 * Adapter de sandbox (INCONSISTENCIAS P2).
 *
 * A plataforma ainda não tem conta em provedor real nem os requisitos de PCI
 * atendidos, mas o PORT precisa existir desde já para o domínio nascer
 * desacoplado (PAY-ARCH-001). Este adapter simula o provedor de forma
 * **determinística**: o mesmo `idempotencyKey` produz sempre o mesmo resultado,
 * o que torna os testes de idempotência honestos.
 *
 * Convenção para exercitar caminhos de erro em desenvolvimento:
 * - valor terminado em `.13` → DECLINED
 * - valor terminado em `.99` → ERROR (falha técnica do provedor)
 * - qualquer outro valor → APPROVED
 *
 * Trocar por Mercado Pago/Stripe = escrever outro adapter. Nada do domínio muda.
 */
@Injectable()
export class SandboxPaymentGateway extends PaymentGateway {
  readonly providerId = 'sandbox';

  constructor(private readonly logger: PinoLogger) {
    super();
    this.logger.setContext(SandboxPaymentGateway.name);
  }

  authorize(request: AuthorizeRequest): Promise<AuthorizationResult> {
    const outcome = this.outcomeFor(request.amountCents);
    this.log('authorize', request.paymentId, request.idempotencyKey, outcome);

    return Promise.resolve({
      outcome,
      providerTransactionId: outcome === 'ERROR' ? null : this.transactionId(request.idempotencyKey),
      providerCode: outcome === 'APPROVED' ? 'approved' : this.declineCode(outcome),
      message:
        outcome === 'APPROVED'
          ? 'Pagamento autorizado pelo provedor de teste.'
          : outcome === 'DECLINED'
            ? 'Pagamento recusado pelo emissor (simulado).'
            : 'Falha temporária do provedor (simulada).',
      authorizationCode: outcome === 'APPROVED' ? this.authCode(request.idempotencyKey) : null,
      authorizedAmountCents: outcome === 'APPROVED' ? request.amountCents : 0,
      // Autorização de cartão costuma expirar em ~7 dias; espelhamos isso.
      expiresAt: outcome === 'APPROVED' ? new Date(Date.now() + 7 * 86400000) : null,
      rawResponse: { provider: this.providerId, simulated: true, outcome },
    });
  }

  capture(request: CaptureRequest): Promise<CaptureResult> {
    this.log('capture', request.providerTransactionId, request.idempotencyKey, 'APPROVED');
    return Promise.resolve({
      outcome: 'APPROVED',
      providerTransactionId: request.providerTransactionId,
      providerCode: 'captured',
      message: 'Captura confirmada pelo provedor de teste.',
      rawResponse: { provider: this.providerId, simulated: true, operation: 'capture' },
    });
  }

  refund(request: RefundRequest): Promise<RefundResult> {
    this.log('refund', request.providerTransactionId, request.idempotencyKey, 'APPROVED');
    return Promise.resolve({
      outcome: 'APPROVED',
      providerTransactionId: request.providerTransactionId,
      providerCode: 'refunded',
      message: 'Reembolso confirmado pelo provedor de teste.',
      refundedAmountCents: request.amountCents,
      rawResponse: {
        provider: this.providerId,
        simulated: true,
        operation: 'refund',
        reason: request.reason,
      },
    });
  }

  cancel(request: CancelRequest): Promise<CancelResult> {
    this.log('cancel', request.providerTransactionId, request.idempotencyKey, 'APPROVED');
    return Promise.resolve({
      outcome: 'APPROVED',
      providerTransactionId: request.providerTransactionId,
      providerCode: 'cancelled',
      message: 'Cancelamento confirmado pelo provedor de teste.',
      rawResponse: { provider: this.providerId, simulated: true, operation: 'cancel' },
    });
  }

  getStatus(providerTransactionId: string): Promise<PaymentStatusResult> {
    return Promise.resolve({
      outcome: 'APPROVED',
      providerTransactionId,
      providerCode: 'approved',
      message: null,
      status: 'APPROVED',
      rawResponse: { provider: this.providerId, simulated: true },
    });
  }

  /** Determinístico pelo valor: permite testar recusa sem mockar o adapter. */
  private outcomeFor(amountCents: number): 'APPROVED' | 'DECLINED' | 'ERROR' {
    const cents = amountCents % 100;
    if (cents === 13) {
      return 'DECLINED';
    }
    if (cents === 99) {
      return 'ERROR';
    }
    return 'APPROVED';
  }

  private declineCode(outcome: 'DECLINED' | 'ERROR'): string {
    return outcome === 'DECLINED' ? 'insufficient_funds' : 'provider_unavailable';
  }

  /** Derivado da chave de idempotência: repetir a chamada dá o mesmo id. */
  private transactionId(idempotencyKey: string): string {
    return `sbx_${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 24)}`;
  }

  private authCode(idempotencyKey: string): string {
    return createHash('sha256').update(`auth:${idempotencyKey}`).digest('hex').slice(0, 6).toUpperCase();
  }

  private log(
    operation: string,
    reference: string | null,
    idempotencyKey: string,
    outcome: string,
  ): void {
    // Observabilidade do ADR §12 — nunca logamos instrumento de pagamento.
    this.logger.info(
      {
        operation: `gateway.${operation}`,
        provider: this.providerId,
        reference,
        idempotencyKey,
        outcome,
        correlationId: randomUUID(),
      },
      'Payment gateway operation executed (sandbox).',
    );
  }
}
