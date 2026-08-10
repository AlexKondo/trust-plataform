import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { fromReais, toReaisString } from '../../../../shared/money/money';
import { PaymentAuthorization } from '../../domain/entities/payment-authorization';
import { AUTHORIZATION_STATUS, AuthorizationStatus } from '../../domain/entities/payment-types';
import { PaymentAuthorizationRepository } from '../../domain/repositories/payment-authorization.repository';
import { PaymentAuthorizationRow, paymentAuthorizations } from './payment.schema';

@Injectable()
export class DrizzlePaymentAuthorizationRepository extends PaymentAuthorizationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(authorization: PaymentAuthorization, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = authorization.toProps();
    // Append-only: cada tentativa é uma linha nova (PAY-002 BR-003).
    await target.insert(paymentAuthorizations).values({
      id: props.id,
      paymentId: props.paymentId,
      providerId: props.providerId,
      idempotencyKey: props.idempotencyKey,
      providerTransactionId: props.providerTransactionId,
      authorizationCode: props.authorizationCode,
      authorizedAmount: toReaisString(props.authorizedAmountCents),
      status: props.status,
      providerCode: props.providerCode,
      message: props.message,
      authorizedAt: props.authorizedAt,
      expiresAt: props.expiresAt,
      gatewayResponse: props.gatewayResponse,
      createdAt: props.createdAt,
    });
  }

  async findByIdempotencyKey(key: string): Promise<PaymentAuthorization | null> {
    const [row] = await this.db
      .select()
      .from(paymentAuthorizations)
      .where(eq(paymentAuthorizations.idempotencyKey, key))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async listByPayment(paymentId: string): Promise<PaymentAuthorization[]> {
    const rows = await this.db
      .select()
      .from(paymentAuthorizations)
      .where(eq(paymentAuthorizations.paymentId, paymentId))
      .orderBy(desc(paymentAuthorizations.createdAt));
    return rows.map(toDomain);
  }

  async findApprovedByPayment(paymentId: string): Promise<PaymentAuthorization | null> {
    const [row] = await this.db
      .select()
      .from(paymentAuthorizations)
      .where(
        and(
          eq(paymentAuthorizations.paymentId, paymentId),
          eq(paymentAuthorizations.status, AUTHORIZATION_STATUS.APPROVED),
        ),
      )
      .orderBy(desc(paymentAuthorizations.createdAt))
      .limit(1);
    return row ? toDomain(row) : null;
  }
}

function toDomain(row: PaymentAuthorizationRow): PaymentAuthorization {
  return PaymentAuthorization.restore({
    id: row.id,
    paymentId: row.paymentId,
    providerId: row.providerId,
    idempotencyKey: row.idempotencyKey,
    providerTransactionId: row.providerTransactionId,
    authorizationCode: row.authorizationCode,
    authorizedAmountCents: fromReais(row.authorizedAmount),
    status: row.status as AuthorizationStatus,
    providerCode: row.providerCode,
    message: row.message,
    authorizedAt: row.authorizedAt,
    expiresAt: row.expiresAt,
    gatewayResponse: (row.gatewayResponse as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
  });
}
