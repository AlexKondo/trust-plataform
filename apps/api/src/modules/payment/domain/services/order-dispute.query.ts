/**
 * Porta de leitura para o Marketplace (PACK-01 §10, regra "Open dispute").
 *
 * O domínio de pagamentos NÃO conhece entidades do Marketplace: pergunta só o
 * que precisa saber para decidir a liberação — se há disputa ativa no pedido.
 * O adapter que resolve isso vive em `infrastructure/`, onde cruzar fronteira
 * de módulo é permitido.
 */
export abstract class OrderDisputeQuery {
  abstract hasActiveDispute(orderId: string): Promise<boolean>;
}
