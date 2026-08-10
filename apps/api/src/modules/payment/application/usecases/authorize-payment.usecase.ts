import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { toReais } from '../../../../shared/money/money';
import { PaymentAuthorization } from '../../domain/entities/payment-authorization';
import { PAYMENT_STATUS } from '../../domain/entities/payment-types';
import {
  PaymentNotFoundException,
  PaymentTransitionException,
} from '../../domain/exceptions/payment.exceptions';
import { PaymentAuthorizationRepository } from '../../domain/repositories/payment-authorization.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { PaymentProviderResolver } from '../../infrastructure/gateway/payment-provider.resolver';
import { PAY_PRODUCER } from '../../infrastructure/consumers/create-payment.consumer';
import {
  AuthorizePaymentRequest,
  AuthorizePaymentResponse,
  RequestMeta,
} from '../dto/payment.dtos';
import { toAuthorizationResponse, toPaymentResponse } from '../mapper/payment.mapper';

/**
 * PAY-002 — o cliente paga.
 *
 * Três defesas contra cobrança dupla, em ordem:
 * 1. chave de idempotência já usada → devolve o resultado anterior, sem tocar
 *    no gateway (PAY-ARCH-001 §9);
 * 2. pagamento já autorizado → devolve a autorização vigente;
 * 3. a máquina de estados do agregado recusa segunda transição.
 *
 * O gateway é chamado FORA da transação de banco: chamada de rede não pode
 * segurar transação aberta. A persistência do resultado é que é transacional.
 */
@Injectable()
export class AuthorizePaymentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly authorizationRepository: PaymentAuthorizationRepository,
    private readonly providerResolver: PaymentProviderResolver,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthorizePaymentUseCase.name);
  }

  async execute(
    identityId: string,
    paymentId: string,
    idempotencyKey: string,
    body: AuthorizePaymentRequest,
    meta: RequestMeta = {},
  ): Promise<AuthorizePaymentResponse> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new PaymentNotFoundException();
    }
    payment.assertBuyer(identityId);

    // Defesa 1 — a mesma chave nunca cobra duas vezes.
    const previous = await this.authorizationRepository.findByIdempotencyKey(idempotencyKey);
    if (previous) {
      this.logger.info(
        {
          operation: 'AuthorizePayment',
          paymentId,
          idempotencyKey,
          result: 'REPLAYED',
          correlationId: meta.correlationId,
        },
        'Idempotent replay: returning the previous authorization without charging again.',
      );
      return {
        authorized: previous.isApproved(),
        payment: toPaymentResponse(payment),
        authorization: toAuthorizationResponse(previous),
        replayed: true,
      };
    }

    // Defesa 2 — já autorizado: devolve o que existe em vez de cobrar de novo.
    if (payment.status !== PAYMENT_STATUS.CREATED) {
      const approved = await this.authorizationRepository.findApprovedByPayment(paymentId);
      if (approved) {
        return {
          authorized: true,
          payment: toPaymentResponse(payment),
          authorization: toAuthorizationResponse(approved),
          replayed: true,
        };
      }
      throw new PaymentTransitionException(payment.status, PAYMENT_STATUS.AUTHORIZED);
    }

    const gateway = this.providerResolver.resolve({ currency: payment.currency });
    const result = await gateway.authorize({
      paymentId: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      paymentMethodToken: body.paymentMethodToken ?? null,
      idempotencyKey,
      correlationId: meta.correlationId ?? payment.id,
    });

    const authorization = PaymentAuthorization.fromGatewayResult({
      paymentId: payment.id,
      providerId: gateway.providerId,
      idempotencyKey,
      result,
    });

    // Defesa 3 — o agregado recusa transição inválida.
    if (authorization.isApproved()) {
      payment.markAuthorized(gateway.providerId);
    } else {
      payment.markAuthorizationFailed();
    }

    await this.db.transaction(async (tx) => {
      await this.authorizationRepository.save(authorization, tx);
      await this.paymentRepository.save(payment, tx);
      await this.outboxService.enqueue(tx, {
        eventName: authorization.isApproved()
          ? 'Payment.Authorized'
          : 'Payment.AuthorizationFailed',
        producer: PAY_PRODUCER,
        correlationId: meta.correlationId ?? payment.id,
        payload: {
          paymentId: payment.id,
          orderId: payment.orderId,
          buyerId: payment.buyerId,
          sellerId: payment.sellerId,
          authorizationId: authorization.id,
          providerId: gateway.providerId,
          amount: toReais(payment.amountCents),
          currency: payment.currency,
          status: payment.status,
          ...(authorization.isApproved()
            ? { authorizedAt: authorization.authorizedAt!.toISOString() }
            : { failureCode: authorization.providerCode, failedAt: new Date().toISOString() }),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'AuthorizePayment',
          resource: 'Payment',
          resourceId: payment.id,
          result: authorization.isApproved() ? 'SUCCESS' : 'FAILURE',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: {
            // Auditoria financeira exige a chave e o provedor (ADR §11).
            idempotencyKey,
            providerId: gateway.providerId,
            providerCode: authorization.providerCode,
            amountCents: payment.amountCents,
          },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'AuthorizePayment',
        identityId,
        paymentId: payment.id,
        orderId: payment.orderId,
        provider: gateway.providerId,
        idempotencyKey,
        amountCents: payment.amountCents,
        outcome: authorization.status,
        result: authorization.isApproved() ? 'SUCCESS' : 'FAILURE',
        correlationId: meta.correlationId,
      },
      'Payment authorization attempted.',
    );

    return {
      authorized: authorization.isApproved(),
      payment: toPaymentResponse(payment),
      authorization: toAuthorizationResponse(authorization),
      replayed: false,
    };
  }
}
