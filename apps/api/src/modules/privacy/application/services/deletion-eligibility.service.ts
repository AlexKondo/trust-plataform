import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { CUSTODY_STATUS } from '../../../payment/domain/entities/trust-custody';
import { IncrementalTrustCustodyRepository } from '../../../payment/domain/repositories/incremental-trust-custody.repository';
import { TrustCustodyRepository } from '../../../payment/domain/repositories/trust-custody.repository';
import { MarketplaceOrder } from '../../../marketplace/domain/entities/marketplace-order';
import { ORDER_STATUS, SERVICE_REQUEST_STATUS } from '../../../marketplace/domain/entities/marketplace-types';
import { MarketplaceOrderRepository } from '../../../marketplace/domain/repositories/marketplace-order.repository';
import { ServiceRequestRepository } from '../../../marketplace/domain/repositories/service-request.repository';
import { DELETION_REJECTION_REASON, DeletionRejectionReason } from '../../domain/entities/privacy-request';

/** Estados de pedido em que NENHUMA obrigação financeira/de execução segue em aberto. */
const TERMINAL_ORDER_STATUSES: readonly string[] = [ORDER_STATUS.CLOSED, ORDER_STATUS.CANCELLED];
const NON_TERMINAL_SERVICE_REQUEST_STATUSES: readonly string[] = [
  SERVICE_REQUEST_STATUS.OPEN,
  SERVICE_REQUEST_STATUS.MATCHED,
];
const PAGE_SIZE = 100;

/**
 * IP-021 — trava de ENGENHARIA (não uma alegação jurídica) que impede
 * anonimizar uma Identity enquanto ela ainda participa de um pedido, custódia
 * ou pedido de serviço não-terminal. Ver
 * `ActiveObligationsPreventDeletionException` e o Completion Report §8 para a
 * distinção explícita entre "proteger uma máquina de estados em andamento" e
 * "decisão legal sobre retenção" — só a segunda foi tratada como Conflict
 * Escalation.
 *
 * IP-021 Diff Review §6 (finding #1, BLOCKING, corrigido): todo método aqui
 * aceita um `executor` opcional. `RequestDataDeletionUseCase` DEVE passar a
 * própria conexão da transação de anonimização (`tx`), nunca chamar isto sem
 * `executor` a partir dali — checar fora da transação (ou usando uma
 * conexão separada do pool) deixa uma janela de TOCTOU entre a leitura e a
 * mutação em que um pedido/custódia concorrente pode ser criado sem ser
 * visto. Ver o comentário em `request-data-deletion.usecase.ts` para o
 * ponto exato onde isto importa.
 */
@Injectable()
export class DeletionEligibilityService {
  constructor(
    private readonly orderRepository: MarketplaceOrderRepository,
    private readonly trustCustodyRepository: TrustCustodyRepository,
    private readonly incrementalTrustCustodyRepository: IncrementalTrustCustodyRepository,
    private readonly serviceRequestRepository: ServiceRequestRepository,
  ) {}

  async checkEligibility(
    identityId: string,
    executor?: DatabaseExecutor,
  ): Promise<DeletionRejectionReason | null> {
    const orders = await this.listAllOrders(identityId, executor);

    const nonTerminalOrder = orders.find((order) => !TERMINAL_ORDER_STATUSES.includes(order.status));
    if (nonTerminalOrder) {
      return DELETION_REJECTION_REASON.ACTIVE_ORDERS;
    }

    for (const order of orders) {
      const [custody, incrementalCustodies] = await Promise.all([
        this.trustCustodyRepository.findByOrderId(order.id, executor),
        this.incrementalTrustCustodyRepository.listByOrderId(order.id, executor),
      ]);
      if (custody && custody.status !== CUSTODY_STATUS.RELEASED) {
        return DELETION_REJECTION_REASON.ACTIVE_CUSTODY;
      }
      if (incrementalCustodies.some((tranche) => tranche.status !== CUSTODY_STATUS.RELEASED)) {
        return DELETION_REJECTION_REASON.ACTIVE_CUSTODY;
      }
    }

    const serviceRequests = await this.listAllServiceRequests(identityId, executor);
    const nonTerminalRequest = serviceRequests.find((request) =>
      NON_TERMINAL_SERVICE_REQUEST_STATUSES.includes(request.status),
    );
    if (nonTerminalRequest) {
      return DELETION_REJECTION_REASON.ACTIVE_SERVICE_REQUEST;
    }

    return null;
  }

  /**
   * `listForParticipant` é paginado — percorre todas as páginas para que uma
   * conta com muitos pedidos não escape da checagem por causa de um limite de
   * página (o erro mais caro possível aqui seria um falso-negativo: aprovar
   * uma exclusão que na verdade tinha obrigação em aberto).
   */
  private async listAllOrders(
    identityId: string,
    executor?: DatabaseExecutor,
  ): Promise<MarketplaceOrder[]> {
    const all: MarketplaceOrder[] = [];
    let page = 1;
    for (;;) {
      const { items, totalItems } = await this.orderRepository.listForParticipant(
        identityId,
        page,
        PAGE_SIZE,
        executor,
      );
      all.push(...items);
      if (all.length >= totalItems || items.length === 0) {
        break;
      }
      page += 1;
    }
    return all;
  }

  private async listAllServiceRequests(
    identityId: string,
    executor?: DatabaseExecutor,
  ): Promise<Array<{ status: string }>> {
    const all: Array<{ status: string }> = [];
    let page = 1;
    for (;;) {
      const { items, totalItems } = await this.serviceRequestRepository.findByOwner(
        identityId,
        page,
        PAGE_SIZE,
        executor,
      );
      all.push(...items.map((item) => ({ status: item.status })));
      if (all.length >= totalItems || items.length === 0) {
        break;
      }
      page += 1;
    }
    return all;
  }
}
