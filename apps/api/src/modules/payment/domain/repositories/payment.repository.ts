import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { Cents } from '../../../../shared/money/money';
import { Payment } from '../entities/payment';
import { PaymentStatus } from '../entities/payment-types';

export abstract class PaymentRepository {
  /** Insere; devolve false se o pedido já tinha pagamento (PAY-001 BR-001). */
  abstract create(payment: Payment, executor?: DatabaseExecutor): Promise<boolean>;
  abstract save(payment: Payment, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string, executor?: DatabaseExecutor): Promise<Payment | null>;
  abstract findByOrderId(orderId: string, executor?: DatabaseExecutor): Promise<Payment | null>;
  abstract listForParticipant(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: Payment[]; totalItems: number }>;

  /**
   * IP-008 — CAS do acumulado de reembolso: só grava se `refunded_amount`
   * no banco ainda for EXATAMENTE `expectedRefundedCents` (o valor que o
   * chamador leu antes de decidir `newRefundedCents`/`newStatus` em memória
   * via `Payment.registerRefund`). Isto é o equivalente, para um campo que
   * ACUMULA (em vez de um enum de estado), do `UPDATE ... WHERE status = ?`
   * que `saveWithExpectedStatus`/`markReadyForReleaseIfInCustody` já usam
   * neste código: protege "nunca reembolsar além do custodiado" mesmo quando
   * DOIS reembolsos concorrentes (ex.: cancelamento e disputa) tentam gravar
   * ao mesmo tempo — sem isto, dois use cases com sua própria cópia em
   * memória do Payment poderiam cada um passar na checagem individual e juntos
   * ultrapassar o teto. `false` sinaliza perda de corrida: quem chama deve
   * reler o Payment e tentar de novo (ver `RefundPaymentUseCase`).
   */
  abstract applyRefundIfExpected(
    paymentId: string,
    expectedRefundedCents: Cents,
    newRefundedCents: Cents,
    newStatus: PaymentStatus,
    now: Date,
    executor?: DatabaseExecutor,
  ): Promise<boolean>;
}
