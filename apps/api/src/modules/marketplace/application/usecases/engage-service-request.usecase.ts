import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { SERVICE_REQUEST_STATUS } from '../../domain/entities/marketplace-types';
import {
  ServiceRequestListingUnavailableException,
  ServiceRequestNotFoundException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestRepository } from '../../domain/repositories/service-request.repository';
import { EngageServiceRequestRequest } from '../dto/service-request.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toConversationResponse, toMessageResponse } from '../mapper/marketplace.mapper';
import { toEngagementResponse } from '../mapper/service-request.mapper';
import { ContactListingOwnerUseCase } from './contact-listing-owner.usecase';
import { SVR_PRODUCER } from './create-service-request.usecase';

export interface EngageServiceRequestResult {
  engagement: ReturnType<typeof toEngagementResponse>;
  conversation: ReturnType<typeof toConversationResponse>;
  message: ReturnType<typeof toMessageResponse>;
  /** false quando o engajamento com ESTE anúncio já existia (mesmo padrão de `created` do MRK-006). */
  created: boolean;
}

/**
 * IP-003 — liga o pedido de serviço ao ciclo já existente de conversa/proposta.
 * Reutiliza `ContactListingOwnerUseCase.execute()` VERBATIM (zero modificação
 * nesse arquivo — mandato explícito: "reuse contact-listing-owner.usecase.ts's
 * shape... rather than inventing a parallel conversation-creation path"): toda
 * a validação de disponibilidade do anúncio, o dedupe de conversa ativa
 * (MRK-006 BR-005) e a criação da mensagem continuam exatamente como são hoje.
 *
 * O que esta IP acrescenta é só o REGISTRO de que aquele contato nasceu deste
 * ServiceRequest (`ServiceRequestEngagementRecord`) e a transição
 * OPEN -> MATCHED (idempotente). Isso roda em uma transação SEPARADA da do
 * `ContactListingOwnerUseCase` — se falhar depois da conversa já criada, a
 * conversa continua válida (o Member já tem o contato) e uma nova tentativa
 * deste use case é **segura para o estado persistido**:
 * `ContactListingOwnerUseCase` reaproveita a mesma conversa ativa, e
 * `saveEngagement`/`markMatchedIfOpen` não duplicam nada (mesma postura de
 * janela de eventual-consistency aceita pelo IP-007 §12.2 para o análogo
 * "Change Order aprovado, mas ainda sem custódia"). Ressalva: não é
 * idempotente ponta a ponta no efeito colateral da CONVERSA —
 * `ContactListingOwnerUseCase` sempre cria uma mensagem nova, mesmo ao
 * reaproveitar a conversa, então uma repetição por causa de falha entre as
 * duas transações anexa uma mensagem extra (comportamento pré-existente do
 * MRK-006, não introduzido aqui; o trade-off é deliberadamente "mensagem a
 * mais" em vez de "contato perdido").
 *
 * A publicação de `ServiceRequest.Matched` é gated pelo retorno REAL de
 * `markMatchedIfOpen` (`casWon`), nunca pela leitura de `request.status`
 * feita antes da transação — sob corrida genuína, duas chamadas concorrentes
 * podem ler `OPEN` e ambas tentar a CAS, mas só uma vence; gatear o evento
 * pela leitura pré-transação publicaria `Matched` duas vezes mesmo com o
 * estado persistido transicionando uma única vez. Mesmo idioma de
 * `release-funds.usecase.ts` (IP-007): captura o retorno booleano da CAS, não
 * um snapshot anterior à corrida.
 */
@Injectable()
export class EngageServiceRequestUseCase {
  constructor(
    private readonly serviceRequestRepository: ServiceRequestRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly contactListingOwnerUseCase: ContactListingOwnerUseCase,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EngageServiceRequestUseCase.name);
  }

  async execute(
    memberId: string,
    serviceRequestId: string,
    body: EngageServiceRequestRequest,
    meta: RequestMeta = {},
  ): Promise<EngageServiceRequestResult> {
    const request = await this.serviceRequestRepository.findById(serviceRequestId);
    if (!request || !request.isOwnedBy(memberId)) {
      throw new ServiceRequestNotFoundException();
    }
    request.assertEngageable();

    const listing = await this.listingRepository.findPublishedById(body.listingId);
    if (!listing) {
      throw new ServiceRequestListingUnavailableException();
    }

    // Reaproveita, sem alterar: ownership/disponibilidade/dedupe de conversa/mensagem.
    const contactResult = await this.contactListingOwnerUseCase.execute(
      memberId,
      body.listingId,
      { message: body.message },
      meta,
    );

    // Após assertEngageable(), status só pode ser OPEN ou MATCHED.
    const wasAlreadyMatched = request.status === SERVICE_REQUEST_STATUS.MATCHED;

    const engagementRecord = {
      id: uuidv7(),
      serviceRequestId,
      listingId: body.listingId,
      partnerId: listing.ownerId,
      conversationId: contactResult.conversation.conversationId,
      engagedBy: memberId,
      engagedAt: new Date(),
    };

    let engagementCreated = false;
    // Ganhador REAL da CAS (não a leitura pré-transação): sob corrida genuína,
    // duas chamadas concorrentes podem ambas computar `wasAlreadyMatched = false`
    // (ambas leram OPEN antes da janela de corrida); só uma delas pode vencer o
    // `UPDATE ... WHERE status = 'OPEN'`. Publicar `ServiceRequest.Matched` com
    // base na leitura teria deixado as DUAS publicarem o evento mesmo com o
    // estado persistido corretamente transicionando uma única vez — exatamente
    // o padrão que `release-funds.usecase.ts` (IP-007) já evita, capturando o
    // retorno de `markReadyForReleaseIfInCustody`/`markReleasedIfReady` em vez
    // de confiar numa leitura anterior à corrida.
    let casWon = false;
    await this.db.transaction(async (tx) => {
      if (!wasAlreadyMatched) {
        // CAS: só grava MATCHED se ainda estava OPEN (corrida entre dois engajamentos simultâneos).
        casWon = await this.serviceRequestRepository.markMatchedIfOpen(serviceRequestId, engagementRecord.engagedAt, tx);
      }
      engagementCreated = await this.serviceRequestRepository.saveEngagement(engagementRecord, tx);

      if (engagementCreated) {
        await this.outboxService.enqueue(tx, {
          eventType: 'ServiceRequestEngagement.Created',
          aggregateType: 'ServiceRequestEngagement',
          aggregateId: engagementRecord.id,
          producer: SVR_PRODUCER,
          correlationId: meta.correlationId ?? serviceRequestId,
          payload: {
            serviceRequestId,
            listingId: body.listingId,
            partnerId: listing.ownerId,
            conversationId: engagementRecord.conversationId,
            engagedBy: memberId,
            engagedAt: engagementRecord.engagedAt.toISOString(),
          },
        });
        if (casWon) {
          await this.outboxService.enqueue(tx, {
            eventType: 'ServiceRequest.Matched',
            aggregateType: 'ServiceRequest',
            aggregateId: serviceRequestId,
            producer: SVR_PRODUCER,
            correlationId: meta.correlationId ?? serviceRequestId,
            payload: {
              serviceRequestId,
              memberId,
              listingId: body.listingId,
              partnerId: listing.ownerId,
              matchedAt: engagementRecord.engagedAt.toISOString(),
            },
          });
        }
      }
      await this.auditLogService.record(
        {
          identityId: memberId,
          operation: 'EngageServiceRequestPartner',
          resource: 'ServiceRequest',
          resourceId: serviceRequestId,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { listingId: body.listingId, partnerId: listing.ownerId, reused: !engagementCreated },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'EngageServiceRequestPartner',
        identityId: memberId,
        serviceRequestId,
        listingId: body.listingId,
        conversationId: engagementRecord.conversationId,
        engagementCreated,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Service request engaged with Trust Partner.',
    );

    return {
      engagement: toEngagementResponse(engagementRecord),
      conversation: contactResult.conversation,
      message: contactResult.message,
      created: engagementCreated,
    };
  }
}
