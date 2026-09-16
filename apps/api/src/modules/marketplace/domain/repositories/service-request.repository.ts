import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { ServiceRequest } from '../entities/service-request';

/**
 * Um engajamento = a origem de UMA conversa a partir de um ServiceRequest.
 * Não é um aggregate root próprio (não tem ciclo de vida/estado — é um fato
 * de ligação, mesmo espírito de `ChangeOrderEvidenceRecord` em
 * trust-change-order.repository.ts): a conversa criada já é o
 * MarketplaceConversation existente (MRK-006..008), este registro só marca
 * "esta conversa nasceu deste pedido, com este anúncio/Partner".
 */
export interface ServiceRequestEngagementRecord {
  id: string;
  serviceRequestId: string;
  listingId: string;
  partnerId: string;
  conversationId: string;
  engagedBy: string;
  engagedAt: Date;
}

/** Contrato de persistência do pedido de serviço (só persistência — zero regra de negócio). */
export abstract class ServiceRequestRepository {
  abstract save(request: ServiceRequest, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string): Promise<ServiceRequest | null>;
  /** IP-021 — `executor` opcional, mesmo motivo de `MarketplaceOrderRepository.listForParticipant`. */
  abstract findByOwner(
    memberId: string,
    page: number,
    pageSize: number,
    executor?: DatabaseExecutor,
  ): Promise<{ items: ServiceRequest[]; totalItems: number }>;

  /**
   * Compare-and-set: só transiciona OPEN -> MATCHED se ainda estiver OPEN no
   * banco (mesma técnica de `saveWithExpectedStatus`/`closePauseIfOpen`).
   * `false` quando outro engajamento concorrente já fez a transição — isso
   * NÃO é erro (ver `ServiceRequest.markMatched`, idempotente por design).
   */
  abstract markMatchedIfOpen(
    id: string,
    matchedAt: Date,
    executor?: DatabaseExecutor,
  ): Promise<boolean>;

  /** Um engajamento por (serviceRequestId, listingId) — reaproveitado em novo contato (idempotente). */
  abstract findEngagement(
    serviceRequestId: string,
    listingId: string,
  ): Promise<ServiceRequestEngagementRecord | null>;

  /** `onConflictDoNothing` no par único — corrida entre dois engajamentos concorrentes não duplica. */
  abstract saveEngagement(
    record: ServiceRequestEngagementRecord,
    executor?: DatabaseExecutor,
  ): Promise<boolean>;

  abstract listEngagements(serviceRequestId: string): Promise<ServiceRequestEngagementRecord[]>;
}
