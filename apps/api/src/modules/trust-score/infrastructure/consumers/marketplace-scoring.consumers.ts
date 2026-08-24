import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { TrustPassportRepository } from '../../../trust-passport/domain/repositories/trust-passport.repository';
import { RegisterTrustEventUseCase } from '../../application/usecases/register-trust-event.usecase';

/**
 * INCONSISTENCIAS #13 — o marketplace passa a alimentar o Trust Score.
 *
 * O `RegisterTrustEventUseCase` pontua por `payload.trustPassportId`, mas os
 * eventos do marketplace carregam identityIds. Estes consumers resolvem o
 * Passport de QUEM deve ser pontuado e reenviam o envelope enriquecido — o
 * cálculo em si continua exclusivo do Trust Engine (regra de ouro TP-001).
 *
 * `trust_events.source_event_id` é único, então cada evento pontua exatamente
 * um Passport: a confirmação premia quem prestou o serviço; o cancelamento
 * penaliza quem cancelou.
 */
abstract class MarketplaceScoringConsumer extends EventConsumer {
  constructor(
    private readonly passportRepository: TrustPassportRepository,
    private readonly registerTrustEvent: RegisterTrustEventUseCase,
    protected readonly logger: PinoLogger,
  ) {
    super();
  }

  /** Identity que recebe os pontos (ou a penalidade) deste evento. */
  protected abstract targetIdentityId(payload: Record<string, unknown>): string | undefined;

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const payload = envelope.payload;
    const identityId = this.targetIdentityId(payload);
    if (!identityId) {
      return;
    }
    const passport = await this.passportRepository.findByIdentityId(identityId);
    if (!passport) {
      // Passport ainda não criado (TPS-001 em voo) — pg-boss reagenda
      throw new Error(`Trust Passport for identity ${identityId} not found yet; will retry.`);
    }

    await this.registerTrustEvent.execute(
      { ...envelope, payload: { ...payload, trustPassportId: passport.id } },
      tx,
    );
  }
}

/**
 * `MarketplaceOrder.CustomerConfirmed` → pontos para o PRESTADOR.
 * É o momento em que trabalho entregue vira reputação — o ciclo que o produto
 * promete: confiança gera trabalho, trabalho gera confiança.
 */
@Injectable()
export class OrderConfirmedScoringConsumer extends MarketplaceScoringConsumer {
  readonly eventType = 'MarketplaceOrder.CustomerConfirmed';
  readonly consumerName = 'trs.score-order-confirmed';

  constructor(
    passportRepository: TrustPassportRepository,
    registerTrustEvent: RegisterTrustEventUseCase,
    logger: PinoLogger,
  ) {
    super(passportRepository, registerTrustEvent, logger);
    this.logger.setContext(OrderConfirmedScoringConsumer.name);
  }

  protected targetIdentityId(payload: Record<string, unknown>): string | undefined {
    return payload.sellerId as string | undefined;
  }
}

/** `MarketplaceOrder.Cancelled` → penalidade para QUEM cancelou. */
@Injectable()
export class OrderCancelledScoringConsumer extends MarketplaceScoringConsumer {
  readonly eventType = 'MarketplaceOrder.Cancelled';
  readonly consumerName = 'trs.score-order-cancelled';

  constructor(
    passportRepository: TrustPassportRepository,
    registerTrustEvent: RegisterTrustEventUseCase,
    logger: PinoLogger,
  ) {
    super(passportRepository, registerTrustEvent, logger);
    this.logger.setContext(OrderCancelledScoringConsumer.name);
  }

  protected targetIdentityId(payload: Record<string, unknown>): string | undefined {
    return payload.cancelledBy as string | undefined;
  }
}

/**
 * `MarketplaceReview.Created` → pontos para QUEM FOI AVALIADO (MRK-025).
 * Nota 4–5 soma, 3 quase não mexe, 1–2 subtrai: a reputação passa a refletir a
 * opinião de quem realmente contratou.
 */
@Injectable()
export class ReviewCreatedScoringConsumer extends MarketplaceScoringConsumer {
  readonly eventType = 'MarketplaceReview.Created';
  readonly consumerName = 'trs.score-review-created';

  constructor(
    passportRepository: TrustPassportRepository,
    registerTrustEvent: RegisterTrustEventUseCase,
    logger: PinoLogger,
  ) {
    super(passportRepository, registerTrustEvent, logger);
    this.logger.setContext(ReviewCreatedScoringConsumer.name);
  }

  protected targetIdentityId(payload: Record<string, unknown>): string | undefined {
    return payload.reviewedUserId as string | undefined;
  }
}

/**
 * `MarketplaceDispute.Resolved` → penalidade para a parte considerada culpada.
 * Desfechos sem culpa (improcedente, acordo, cancelamento) chegam com
 * `faultIdentityId: null` e simplesmente não pontuam.
 */
@Injectable()
export class DisputeResolvedScoringConsumer extends MarketplaceScoringConsumer {
  readonly eventType = 'MarketplaceDispute.Resolved';
  readonly consumerName = 'trs.score-dispute-resolved';

  constructor(
    passportRepository: TrustPassportRepository,
    registerTrustEvent: RegisterTrustEventUseCase,
    logger: PinoLogger,
  ) {
    super(passportRepository, registerTrustEvent, logger);
    this.logger.setContext(DisputeResolvedScoringConsumer.name);
  }

  protected targetIdentityId(payload: Record<string, unknown>): string | undefined {
    return (payload.faultIdentityId as string | null) ?? undefined;
  }
}
