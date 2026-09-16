import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { toReais } from '../../../../shared/money/money';
import { IncrementalTrustCustody } from '../../domain/entities/incremental-trust-custody';
import { PaymentIncrementalAuthorization } from '../../domain/entities/payment-incremental-authorization';
import { PAYMENT_STATUS, PaymentStatus } from '../../domain/entities/payment-types';
import { IncrementalTrustCustodyRepository } from '../../domain/repositories/incremental-trust-custody.repository';
import { PaymentIncrementalAuthorizationRepository } from '../../domain/repositories/payment-incremental-authorization.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { ChangeOrderCommercialQuery } from '../../domain/services/change-order-commercial.query';
import { PaymentProviderResolver } from '../../infrastructure/gateway/payment-provider.resolver';
import { PAY_PRODUCER } from '../../infrastructure/consumers/create-payment.consumer';

export interface CreateIncrementalAuthorizationInput {
  changeOrderId: string;
  correlationId: string;
  /** eventId de `TrustChangeOrder.Approved` — encadeia a causalidade. */
  causationId?: string;
}

export type CreateIncrementalAuthorizationOutcome =
  | { result: 'AUTHORIZED_AND_HELD'; authorizationId: string; custodyId: string }
  | { result: 'AUTHORIZATION_DECLINED'; authorizationId: string }
  | { result: 'ALREADY_PROCESSED'; authorizationId: string }
  | {
      result: 'SKIPPED';
      reason:
        | 'CHANGE_ORDER_NOT_APPROVED'
        | 'PAYMENT_NOT_FOUND'
        | 'PAYMENT_NOT_ELIGIBLE'
        | 'CONCURRENT_WINNER';
    };

/**
 * Só faz sentido autorizar um DELTA em cima de um pagamento cujo método já foi
 * usado com sucesso pelo menos uma vez — nunca sobre um Payment que ainda nem
 * tentou a autorização original (CREATED), que falhou (AUTHORIZATION_FAILED)
 * ou que já saiu do ciclo de vida financeiro ativo (CANCELLED/REFUNDED). Isto
 * não é uma decisão de produto nova: é a mesma leitura conservadora de
 * "nenhuma reautorização falsa de PSP é inventada aqui" aplicada ao caminho de
 * entrada, não só ao gateway.
 */
const PAYMENT_ELIGIBLE_FOR_INCREMENTAL_AUTHORIZATION: readonly PaymentStatus[] = [
  PAYMENT_STATUS.AUTHORIZED,
  PAYMENT_STATUS.FUNDS_IN_CUSTODY,
  PAYMENT_STATUS.FUNDS_RELEASED,
  PAYMENT_STATUS.SETTLED,
];

/** Chave determinística por Change Order (mesmo espírito de `releaseIdempotencyKey`). */
export function incrementalAuthorizationIdempotencyKey(changeOrderId: string): string {
  return `incremental-auth:${changeOrderId}`;
}

/**
 * IP-007 — autoriza, em sandbox, o DELTA de um Trust Change Order aprovado.
 *
 * Resolve o gap `amountAuthorizedNotInCustody` (PACK-03 §9.1): até aqui, um
 * Change Order aprovado ficava comercialmente autorizado (visível no Service
 * Summary e no evento `TrustChangeOrder.Approved`) sem NENHUM efeito no
 * `Payment`/`TrustCustody` do PACK-01. Este use case fecha esse gap com o
 * desenho mínimo seguro: chama o MESMO port `PaymentGateway` que a autorização
 * original usa, e — só se o gateway aprovar — imediatamente coloca o valor em
 * custódia (`IncrementalTrustCustody`).
 *
 * Diferença deliberada em relação ao par PAY-002/PAY-003 original: lá, autorizar
 * e colocar em custódia são dois eventos/consumers separados (`Payment.Authorized`
 * → `HoldFundsOnAuthorizedConsumer`) porque autorizar é ação do COMPRADOR (ele
 * clica "pagar") e colocar em custódia é reação automática da plataforma a essa
 * ação. Aqui não existe ação de usuário no meio: o gatilho inteiro
 * (`TrustChangeOrder.Approved`) já é automático, então autorizar e custodiar
 * acontecem na MESMA operação — menos uma volta de outbox, sem abrir uma janela
 * onde uma autorização aprovada fica temporariamente sem custódia por falta de
 * um evento intermediário processar.
 *
 * Idempotência em DUAS camadas (Shared Standards §5/§11): o dedupe do outbox
 * (consumerName+eventId) já deveria impedir reentrega, mas o domínio não confia
 * só nisso — `findByChangeOrderId` verifica antes de chamar o gateway, e
 * `UNIQUE(change_order_id)` no banco é a garantia final contra uma corrida de
 * duas entregas concorrentes do mesmo evento.
 */
@Injectable()
export class CreateIncrementalAuthorizationUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly incrementalAuthorizationRepository: PaymentIncrementalAuthorizationRepository,
    private readonly incrementalCustodyRepository: IncrementalTrustCustodyRepository,
    private readonly changeOrderQuery: ChangeOrderCommercialQuery,
    private readonly providerResolver: PaymentProviderResolver,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CreateIncrementalAuthorizationUseCase.name);
  }

  async execute(
    input: CreateIncrementalAuthorizationInput,
  ): Promise<CreateIncrementalAuthorizationOutcome> {
    // Defesa 1 — reentrega do evento nunca autoriza duas vezes o mesmo delta.
    const existing = await this.incrementalAuthorizationRepository.findByChangeOrderId(
      input.changeOrderId,
    );
    if (existing) {
      this.logger.info(
        {
          operation: 'CreateIncrementalAuthorization',
          changeOrderId: input.changeOrderId,
          authorizationId: existing.id,
          result: 'REPLAYED',
          correlationId: input.correlationId,
        },
        'Idempotent replay: incremental authorization already exists for this change order.',
      );
      return { result: 'ALREADY_PROCESSED', authorizationId: existing.id };
    }

    // Defesa 2 — relê o Change Order pela fonte, nunca confia no payload do
    // evento para o valor que vira dinheiro (mesma disciplina de HoldFundsUseCase).
    const snapshot = await this.changeOrderQuery.findApprovedById(input.changeOrderId);
    if (!snapshot) {
      this.logger.warn(
        {
          operation: 'CreateIncrementalAuthorization',
          changeOrderId: input.changeOrderId,
          correlationId: input.correlationId,
          result: 'FAILURE',
          reason: 'CHANGE_ORDER_NOT_APPROVED',
        },
        'TrustChangeOrder.Approved received but the change order is missing or no longer APPROVED; no incremental authorization created.',
      );
      return { result: 'SKIPPED', reason: 'CHANGE_ORDER_NOT_APPROVED' };
    }

    const payment = await this.paymentRepository.findByOrderId(snapshot.orderId);
    if (!payment) {
      this.logger.error(
        {
          operation: 'CreateIncrementalAuthorization',
          changeOrderId: input.changeOrderId,
          orderId: snapshot.orderId,
          correlationId: input.correlationId,
          result: 'FAILURE',
          reason: 'PAYMENT_NOT_FOUND',
        },
        'Approved change order references an order with no Payment; no incremental authorization created.',
      );
      return { result: 'SKIPPED', reason: 'PAYMENT_NOT_FOUND' };
    }

    if (!PAYMENT_ELIGIBLE_FOR_INCREMENTAL_AUTHORIZATION.includes(payment.status)) {
      this.logger.warn(
        {
          operation: 'CreateIncrementalAuthorization',
          changeOrderId: input.changeOrderId,
          paymentId: payment.id,
          paymentStatus: payment.status,
          correlationId: input.correlationId,
          result: 'FAILURE',
          reason: 'PAYMENT_NOT_ELIGIBLE',
        },
        'Payment is not in an eligible status for an incremental authorization; no gateway call made.',
      );
      return { result: 'SKIPPED', reason: 'PAYMENT_NOT_ELIGIBLE' };
    }

    const idempotencyKey = incrementalAuthorizationIdempotencyKey(input.changeOrderId);
    const gateway = this.providerResolver.resolve({ currency: snapshot.currency });
    // Fora da transação de propósito (mesmo motivo de AuthorizePaymentUseCase):
    // chamada de rede não pode segurar transação aberta.
    const result = await gateway.authorize({
      paymentId: payment.id,
      amountCents: snapshot.changeGrossAmountCents,
      currency: snapshot.currency,
      paymentMethodToken: null,
      idempotencyKey,
      correlationId: input.correlationId,
    });

    const authorization = PaymentIncrementalAuthorization.fromGatewayResult({
      paymentId: payment.id,
      changeOrderId: input.changeOrderId,
      orderId: snapshot.orderId,
      buyerId: payment.buyerId,
      sellerId: payment.sellerId,
      providerId: gateway.providerId,
      idempotencyKey,
      amountCents: snapshot.changeGrossAmountCents,
      currency: snapshot.currency,
      result,
    });

    // IP-007 — o desfecho vem do RETORNO da transação, não de uma variável
    // externa mutada de dentro do callback: o TypeScript não propaga
    // narrowing de reatribuições feitas dentro de uma closure para o escopo
    // de fora (comportamento conhecido do compilador), então mutar uma
    // variável `let` externa aqui daria falso-positivo de tipo (`never`) nas
    // leituras abaixo mesmo com a atribuição real acontecendo dentro.
    const { persisted, custody } = await this.db.transaction(async (tx) => {
      // O índice único em change_order_id é a garantia final contra corrida
      // de duas entregas concorrentes do mesmo evento.
      const created = await this.incrementalAuthorizationRepository.create(authorization, tx);
      if (!created) {
        return { persisted: false, custody: null };
      }

      await this.outboxService.enqueue(tx, {
        eventType: authorization.isApproved()
          ? 'PaymentIncrementalAuthorization.Approved'
          : 'PaymentIncrementalAuthorization.Failed',
        aggregateType: 'PaymentIncrementalAuthorization',
        aggregateId: authorization.id,
        producer: PAY_PRODUCER,
        correlationId: input.correlationId,
        causationId: input.causationId,
        payload: {
          incrementalAuthorizationId: authorization.id,
          paymentId: payment.id,
          changeOrderId: authorization.changeOrderId,
          orderId: authorization.orderId,
          buyerId: authorization.buyerId,
          sellerId: authorization.sellerId,
          amount: toReais(authorization.amountCents),
          currency: authorization.currency,
          status: authorization.status,
          ...(authorization.isApproved()
            ? { authorizedAt: authorization.authorizedAt!.toISOString() }
            : { failureCode: authorization.providerCode, failedAt: new Date().toISOString() }),
        },
      });

      await this.auditLogService.record(
        {
          identityId: payment.buyerId,
          operation: 'CreateIncrementalPaymentAuthorization',
          resource: 'PaymentIncrementalAuthorization',
          resourceId: authorization.id,
          result: authorization.isApproved() ? 'SUCCESS' : 'FAILURE',
          correlationId: input.correlationId,
          metadata: {
            changeOrderId: authorization.changeOrderId,
            paymentId: payment.id,
            idempotencyKey,
            providerId: gateway.providerId,
            providerCode: authorization.providerCode,
            amountCents: authorization.amountCents,
          },
        },
        tx,
      );

      if (!authorization.isApproved()) {
        return { persisted: true, custody: null };
      }

      const custody = IncrementalTrustCustody.create({
        paymentId: payment.id,
        orderId: authorization.orderId,
        changeOrderId: authorization.changeOrderId,
        incrementalAuthorizationId: authorization.id,
        buyerId: authorization.buyerId,
        sellerId: authorization.sellerId,
        amountCents: authorization.amountCents,
        currency: authorization.currency,
      });

      const custodyCreated = await this.incrementalCustodyRepository.create(custody, tx);
      if (!custodyCreated) {
        // Não deveria acontecer (UNIQUE(change_order_id) já barrou a segunda
        // autorização acima), mas se acontecer não travamos a autorização já
        // persistida — só não duplicamos a custódia.
        return { persisted: true, custody: null };
      }

      const amount = toReais(custody.amountCents);
      const basePayload = {
        trustCustodyId: custody.id,
        paymentId: payment.id,
        orderId: custody.orderId,
        changeOrderId: custody.changeOrderId,
        incrementalAuthorizationId: custody.incrementalAuthorizationId,
        buyerId: custody.buyerId,
        sellerId: custody.sellerId,
        amount,
        currency: custody.currency,
      };

      // Reaproveita os MESMOS eventType de `Funds.Held`/`TrustCustody.Created`
      // (família já documentada no event-catalog) — o fato é o mesmo (dinheiro
      // entrou em custódia), só o agregado muda (`IncrementalTrustCustody`,
      // não `TrustCustody`). Nenhum consumer hoje assume cardinalidade
      // "um por pagamento" nesses dois eventos (confirmado: zero regra de
      // notificação os consome).
      const createdEvent = await this.outboxService.enqueue(tx, {
        eventType: 'TrustCustody.Created',
        aggregateType: 'IncrementalTrustCustody',
        aggregateId: custody.id,
        producer: PAY_PRODUCER,
        correlationId: input.correlationId,
        causationId: input.causationId,
        payload: { ...basePayload, status: custody.status, startedAt: custody.startedAt.toISOString() },
      });
      await this.outboxService.enqueue(tx, {
        eventType: 'Funds.Held',
        aggregateType: 'IncrementalTrustCustody',
        aggregateId: custody.id,
        producer: PAY_PRODUCER,
        correlationId: input.correlationId,
        causationId: createdEvent.eventId,
        payload: { ...basePayload, heldAt: custody.startedAt.toISOString() },
      });

      await this.auditLogService.record(
        {
          identityId: custody.buyerId,
          operation: 'HoldIncrementalFunds',
          resource: 'IncrementalTrustCustody',
          resourceId: custody.id,
          result: 'SUCCESS',
          correlationId: input.correlationId,
          metadata: {
            changeOrderId: custody.changeOrderId,
            paymentId: payment.id,
            orderId: custody.orderId,
            amount,
            currency: custody.currency,
          },
        },
        tx,
      );

      return { persisted: true, custody };
    });

    if (!persisted) {
      // Corrida com outra entrega concorrente do mesmo evento: quem chegou
      // primeiro já cuidou de tudo (evento + auditoria + custódia).
      return { result: 'SKIPPED', reason: 'CONCURRENT_WINNER' };
    }

    this.logger.info(
      {
        operation: 'CreateIncrementalAuthorization',
        changeOrderId: authorization.changeOrderId,
        authorizationId: authorization.id,
        custodyId: custody?.id ?? null,
        outcome: authorization.status,
        result: authorization.isApproved() ? 'SUCCESS' : 'FAILURE',
        correlationId: input.correlationId,
      },
      'Incremental payment authorization attempted.',
    );

    if (!authorization.isApproved()) {
      return { result: 'AUTHORIZATION_DECLINED', authorizationId: authorization.id };
    }
    if (!custody) {
      // Não deveria acontecer: `custody` é sempre criada, na mesma transação
      // que marcou `persisted = true`, quando a autorização é aprovada (ver
      // acima). Falhar alto aqui é melhor que devolver um outcome mentiroso.
      throw new Error(
        `Incremental authorization ${authorization.id} was approved but no custody tranche was created.`,
      );
    }
    return {
      result: 'AUTHORIZED_AND_HELD',
      authorizationId: authorization.id,
      custodyId: custody.id,
    };
  }
}
