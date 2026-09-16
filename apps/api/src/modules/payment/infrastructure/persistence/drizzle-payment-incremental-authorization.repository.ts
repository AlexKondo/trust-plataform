import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { fromReais, toReaisString } from '../../../../shared/money/money';
import { PaymentIncrementalAuthorization } from '../../domain/entities/payment-incremental-authorization';
import { AuthorizationStatus } from '../../domain/entities/payment-types';
import { PaymentIncrementalAuthorizationRepository } from '../../domain/repositories/payment-incremental-authorization.repository';
import {
  PaymentIncrementalAuthorizationRow,
  paymentIncrementalAuthorizations,
} from './payment-incremental.schema';

@Injectable()
export class DrizzlePaymentIncrementalAuthorizationRepository extends PaymentIncrementalAuthorizationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  /**
   * Retorna false quando o Change Order já tem tentativa registrada.
   *
   * `onConflictDoNothing()` SEM `target`: a tabela tem DUAS colunas únicas
   * (`change_order_id` e `idempotency_key`), e como `idempotency_key` é
   * DERIVADA deterministicamente de `change_order_id`
   * (`incremental-auth:{changeOrderId}`), as duas colidem sempre juntas — mas
   * o Postgres só suprime o conflito da constraint nomeada em `target`. Sem
   * `target`, o ON CONFLICT cobre qualquer constraint única da tabela, o que é
   * o comportamento certo aqui: não importa qual das duas colidiu, o
   * resultado precisa ser "não inseriu de novo", nunca uma exceção crua.
   */
  async create(
    authorization: PaymentIncrementalAuthorization,
    executor?: DatabaseExecutor,
  ): Promise<boolean> {
    const target = executor ?? this.db;
    const props = authorization.toProps();
    const inserted = await target
      .insert(paymentIncrementalAuthorizations)
      .values({
        id: props.id,
        paymentId: props.paymentId,
        changeOrderId: props.changeOrderId,
        orderId: props.orderId,
        buyerId: props.buyerId,
        sellerId: props.sellerId,
        providerId: props.providerId,
        idempotencyKey: props.idempotencyKey,
        providerTransactionId: props.providerTransactionId,
        authorizationCode: props.authorizationCode,
        amount: toReaisString(props.amountCents),
        currency: props.currency,
        status: props.status,
        providerCode: props.providerCode,
        message: props.message,
        authorizedAt: props.authorizedAt,
        expiresAt: props.expiresAt,
        gatewayResponse: props.gatewayResponse,
        createdAt: props.createdAt,
      })
      .onConflictDoNothing()
      .returning({ id: paymentIncrementalAuthorizations.id });
    return inserted.length > 0;
  }

  async findByChangeOrderId(
    changeOrderId: string,
    executor?: DatabaseExecutor,
  ): Promise<PaymentIncrementalAuthorization | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(paymentIncrementalAuthorizations)
      .where(eq(paymentIncrementalAuthorizations.changeOrderId, changeOrderId))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<PaymentIncrementalAuthorization | null> {
    const [row] = await this.db
      .select()
      .from(paymentIncrementalAuthorizations)
      .where(eq(paymentIncrementalAuthorizations.idempotencyKey, key))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async listByPayment(paymentId: string): Promise<PaymentIncrementalAuthorization[]> {
    const rows = await this.db
      .select()
      .from(paymentIncrementalAuthorizations)
      .where(eq(paymentIncrementalAuthorizations.paymentId, paymentId))
      .orderBy(desc(paymentIncrementalAuthorizations.createdAt));
    return rows.map(toDomain);
  }
}

function toDomain(row: PaymentIncrementalAuthorizationRow): PaymentIncrementalAuthorization {
  return PaymentIncrementalAuthorization.restore({
    id: row.id,
    paymentId: row.paymentId,
    changeOrderId: row.changeOrderId,
    orderId: row.orderId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    providerId: row.providerId,
    idempotencyKey: row.idempotencyKey,
    providerTransactionId: row.providerTransactionId,
    authorizationCode: row.authorizationCode,
    amountCents: fromReais(row.amount),
    currency: row.currency,
    status: row.status as AuthorizationStatus,
    providerCode: row.providerCode,
    message: row.message,
    authorizedAt: row.authorizedAt,
    expiresAt: row.expiresAt,
    gatewayResponse: (row.gatewayResponse as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
  });
}
