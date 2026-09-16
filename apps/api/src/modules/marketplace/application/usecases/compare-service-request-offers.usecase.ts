import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TrustScoreRepository } from '../../../trust-score/infrastructure/persistence/drizzle-trust-score.repository';
import { ServiceRequestNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceConversationRepository } from '../../domain/repositories/marketplace-conversation.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import {
  ServiceRequestEngagementRecord,
  ServiceRequestRepository,
} from '../../domain/repositories/service-request.repository';
import { ServiceRequestOfferComparisonResponse } from '../dto/service-request.dtos';
import { toOfferComparisonItem } from '../mapper/service-request.mapper';

/**
 * IP-004 — comparação transparente das propostas concorrentes de um pedido de
 * serviço.
 *
 * Cardinalidade (confirmada em `service-request.ts`/`marketplace-types.ts`,
 * IP-003 §3.1): um `ServiceRequest` JÁ suporta N Partners engajados — `OPEN ->
 * MATCHED` é idempotente por design ("pelo menos um contato já foi feito", não
 * exclusividade) e `ServiceRequestEngagement` tem `UNIQUE(service_request_id,
 * listing_id)`, ou seja, um engajamento por Partner, cada um com sua PRÓPRIA
 * `MarketplaceConversation`/cadeia de `MarketplaceOffer` (MRK-006..014,
 * inalterado). Esta IP não precisou abrir `EngageServiceRequestUseCase` para
 * permitir múltiplos Partners — essa capacidade já existia; o que faltava era
 * só esta camada de LEITURA que junta as negociações paralelas lado a lado.
 *
 * Esta use case é 100% leitura: não muda nenhum estado, não fecha nenhuma
 * proposta, não decide vencedor. Sem ranking oculto/paid placement (IP-004
 * §4) — os itens vêm ordenados por `engagedAt` (ordem de contato), nunca por
 * preço ou reputação; a ordenação por afinidade é responsabilidade da UI, não
 * desta API.
 */
@Injectable()
export class CompareServiceRequestOffersUseCase {
  constructor(
    private readonly serviceRequestRepository: ServiceRequestRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly conversationRepository: MarketplaceConversationRepository,
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly trustScoreRepository: TrustScoreRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CompareServiceRequestOffersUseCase.name);
  }

  async execute(memberId: string, serviceRequestId: string): Promise<ServiceRequestOfferComparisonResponse> {
    const request = await this.serviceRequestRepository.findById(serviceRequestId);
    // Mesma postura de privacidade do resto do agregado (IP-003 §11/§8): um
    // ServiceRequest não tem leitor legítimo além do dono — 404, nunca 403.
    if (!request || !request.isOwnedBy(memberId)) {
      throw new ServiceRequestNotFoundException();
    }

    const now = new Date();
    const engagements = await this.serviceRequestRepository.listEngagements(serviceRequestId);

    const items = await Promise.all(
      engagements.map((engagement) => this.buildComparisonItem(engagement, now)),
    );

    this.logger.info(
      {
        operation: 'CompareServiceRequestOffers',
        identityId: memberId,
        serviceRequestId,
        engagementCount: items.length,
        offersPresentCount: items.filter((item) => item.hasOffer).length,
        result: 'SUCCESS',
      },
      'Service request offer comparison built.',
    );

    return {
      serviceRequestId: request.id,
      serviceRequestStatus: request.effectiveStatus(now),
      items,
    };
  }

  private async buildComparisonItem(engagement: ServiceRequestEngagementRecord, now: Date) {
    const [listing, conversation, offers, score] = await Promise.all([
      this.listingRepository.findById(engagement.listingId),
      this.conversationRepository.findById(engagement.conversationId),
      this.offerRepository.findByConversation(engagement.conversationId),
      this.trustScoreRepository.findScoreByIdentityId(engagement.partnerId),
    ]);

    return toOfferComparisonItem(
      engagement,
      listing,
      conversation?.status ?? null,
      offers,
      score ? { score: score.score, level: score.level } : null,
      now,
    );
  }
}
