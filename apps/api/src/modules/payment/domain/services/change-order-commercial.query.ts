import { Cents } from '../../../../shared/money/money';

/**
 * Porta de leitura para o Marketplace (mesmo espírito de `OrderDisputeQuery`,
 * PACK-01 §10): o domínio de pagamentos NÃO conhece a entidade
 * `TrustChangeOrder` — pergunta só o que precisa para autorizar o delta com
 * segurança. O adapter que cruza a fronteira vive em `infrastructure/`.
 */
export abstract class ChangeOrderCommercialQuery {
  /**
   * Busca o Change Order pelo id e devolve o valor CONGELADO em centavos —
   * nunca confiamos no payload do evento para o número que vira dinheiro
   * (mesma disciplina de `HoldFundsUseCase`, que relê o `Payment` em vez de
   * usar o valor do evento). Devolve `null` se não existir ou não estiver
   * `APPROVED` — o caller decide o que fazer (§6.1 do PACK-03: só aprovado
   * autoriza).
   */
  abstract findApprovedById(changeOrderId: string): Promise<ApprovedChangeOrderSnapshot | null>;

  /**
   * Soma, em centavos, o `changeGrossAmount` de todos os Change Orders
   * APROVADOS de um pedido — o mesmo cálculo que
   * `authorized-commercial.service.ts` já faz no Marketplace, aqui só para
   * compor o resumo de custódia do lado Payments (§custody-summary).
   */
  abstract sumApprovedGrossCentsByOrder(orderId: string): Promise<Cents>;
}

/**
 * `buyerId`/`sellerId` não entram aqui de propósito: `TrustChangeOrder` não os
 * carrega (só `proposedBy`) — quem chama já os tem, do `Payment` (fonte da
 * verdade do lado Payments para essas duas identidades).
 */
export interface ApprovedChangeOrderSnapshot {
  changeOrderId: string;
  orderId: string;
  currency: string;
  changeGrossAmountCents: Cents;
}
