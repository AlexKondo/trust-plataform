import { Injectable } from '@nestjs/common';
import { fromReais } from '../../../../shared/money/money';
import { TrustChangeOrderRepository } from '../../../marketplace/domain/repositories/trust-change-order.repository';
import {
  ApprovedChangeOrderSnapshot,
  ChangeOrderCommercialQuery,
} from '../../domain/services/change-order-commercial.query';

/**
 * Adapter da porta `ChangeOrderCommercialQuery` (mesmo padrão de
 * `MarketplaceOrderDisputeQuery`, PACK-01 §10): cruza a fronteira Payments →
 * Marketplace aqui, na infraestrutura, para o domínio financeiro continuar sem
 * conhecer `TrustChangeOrder`. Leitura pura — Payments nunca escreve em
 * `trust_change_orders`.
 */
@Injectable()
export class MarketplaceChangeOrderCommercialQuery extends ChangeOrderCommercialQuery {
  constructor(private readonly changeOrderRepository: TrustChangeOrderRepository) {
    super();
  }

  async findApprovedById(changeOrderId: string): Promise<ApprovedChangeOrderSnapshot | null> {
    const changeOrder = await this.changeOrderRepository.findById(changeOrderId);
    if (!changeOrder || !changeOrder.isApproved()) {
      return null;
    }
    return {
      changeOrderId: changeOrder.id,
      orderId: changeOrder.orderId,
      currency: changeOrder.currency,
      changeGrossAmountCents: fromReais(changeOrder.changeGrossAmount),
    };
  }

  async sumApprovedGrossCentsByOrder(orderId: string): Promise<number> {
    const changeOrders = await this.changeOrderRepository.listByOrder(orderId);
    return changeOrders
      .filter((changeOrder) => changeOrder.isApproved())
      .reduce((sum, changeOrder) => sum + fromReais(changeOrder.changeGrossAmount), 0);
  }
}
