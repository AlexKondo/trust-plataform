/**
 * IP-020 — inventário de definição de métricas (Shared Standards §11 +
 * IP-020 spec §6 "metrics definitions documented; event-derived where
 * possible").
 *
 * Mesma filosofia do inventário de classificação de dados da IP-021
 * (`apps/api/src/shared/privacy/data-classification.ts`): NÃO é um mecanismo
 * de runtime — nenhum código consulta esta tabela para decidir o que
 * calcular. É a documentação estruturada, legível por máquina, mantida perto
 * do código que ela descreve, para não divergir da query real que produz
 * cada número. `AnalyticsRepository` (infrastructure/persistence) é a
 * implementação exata de cada `formula` abaixo — qualquer revisor pode
 * comparar linha a linha.
 *
 * Princípio central (IP-020 §4, "no enterprise data warehouse"): todo valor
 * é uma agregação SQL ON-DEMAND sobre as tabelas operacionais que já existem
 * (Marketplace/Payment/Trust/Identity) — nenhuma tabela nova, nenhum
 * contador mantido separadamente que possa divergir da fonte. "Reconciliar
 * com a transação de origem" é verdade por construção: o número É a soma/
 * contagem direta das linhas reais, recalculada a cada chamada.
 */

export const METRIC_CATEGORY = {
  FUNNEL: 'FUNNEL',
  CONVERSION: 'CONVERSION',
  TIMING: 'TIMING',
  OUTCOME: 'OUTCOME',
  PAYMENT: 'PAYMENT',
  TRUST_ADOPTION: 'TRUST_ADOPTION',
  RETENTION: 'RETENTION',
} as const;

export type MetricCategory = (typeof METRIC_CATEGORY)[keyof typeof METRIC_CATEGORY];

export interface MetricDefinition {
  key: string;
  name: string;
  category: MetricCategory;
  /** Fato de negócio / evento(s) do catálogo (docs/event-catalog.md) de onde o dado nasce. */
  sourceEvents: readonly string[];
  /** Tabela(s) realmente consultada(s) — a mesma que `AnalyticsRepository` usa. */
  sourceTables: readonly string[];
  /** Fórmula exata, em português de negócio + pseudo-SQL. */
  formula: string;
  notes: string;
}

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  // ---- Funil Request -> Offer -> Contract -> Execution -> Confirmation -> Payment ----
  {
    key: 'requestsCreated',
    name: 'Pedidos de serviço criados',
    category: METRIC_CATEGORY.FUNNEL,
    sourceEvents: ['ServiceRequest.Created'],
    sourceTables: ['service_requests'],
    formula: "count(*) from service_requests where created_at in [from, to)",
    notes:
      'Estágio "Request" do funil (IP-003). Todo ServiceRequest criado pelo Trust Member no período, independente de status final.',
  },
  {
    key: 'requestsMatched',
    name: 'Pedidos com pelo menos um engajamento',
    category: METRIC_CATEGORY.FUNNEL,
    sourceEvents: ['ServiceRequest.Matched'],
    sourceTables: ['service_requests'],
    formula: "count(*) from service_requests where matched_at in [from, to)",
    notes:
      'matched_at é gravado na PRIMEIRA vez que o Member engaja um Partner (IP-003) — idempotente, não conta reengajamentos.',
  },
  {
    key: 'offersCreated',
    name: 'Propostas criadas',
    category: METRIC_CATEGORY.FUNNEL,
    sourceEvents: ['MarketplaceOffer.Created', 'MarketplaceOffer.Countered'],
    sourceTables: ['marketplace_offers'],
    formula: "count(*) from marketplace_offers where created_at in [from, to)",
    notes:
      'Estágio "Offer". Conta toda rodada de proposta (inicial ou contraproposta) — a granularidade de MRK-009..012, não apenas a primeira rodada por conversa.',
  },
  {
    key: 'ordersCreated',
    name: 'Pedidos (contratos) criados',
    category: METRIC_CATEGORY.FUNNEL,
    sourceEvents: ['MarketplaceOrder.Created'],
    sourceTables: ['marketplace_orders'],
    formula: "count(*) from marketplace_orders where created_at in [from, to)",
    notes: 'Estágio "Contract" — nasce exclusivamente do aceite de uma proposta (MRK-013).',
  },
  {
    key: 'executionCompleted',
    name: 'Execuções concluídas (check-out)',
    category: METRIC_CATEGORY.FUNNEL,
    sourceEvents: ['MarketplaceOrder.ExecutionCompleted'],
    sourceTables: ['marketplace_orders'],
    formula: "count(*) from marketplace_orders where completed_at in [from, to)",
    notes:
      'Estágio "Execution". completed_at é o check-out do Partner (MRK-021) — não é a conclusão do pedido (esse é o campo customer_confirmed_at/COMPLETED).',
  },
  {
    key: 'customerConfirmed',
    name: 'Confirmações do cliente',
    category: METRIC_CATEGORY.FUNNEL,
    sourceEvents: ['MarketplaceOrder.CustomerConfirmed'],
    sourceTables: ['marketplace_orders'],
    formula: "count(*) from marketplace_orders where customer_confirmed_at in [from, to)",
    notes: 'Estágio "Confirmation" — o fato de negócio mais importante da plataforma (MRK-022).',
  },
  {
    key: 'paymentsReleased',
    name: 'Custódias liberadas (tranche original)',
    category: METRIC_CATEGORY.FUNNEL,
    sourceEvents: ['Funds.Released'],
    sourceTables: ['trust_custodies'],
    formula: "count(*) from trust_custodies where released_at in [from, to)",
    notes:
      'Estágio "Payment". Cobre apenas a tranche ORIGINAL (trust_custodies) — tranches incrementais de Trust Change Order (IP-007, incremental_trust_custodies) ficam fora do funil de topo por serem eventos comerciais adicionais, não o fluxo linear canônico; ver métrica separada `incrementalCustodyReleasedValueCents` se necessário no futuro.',
  },
  {
    key: 'grossOrderValueCents',
    name: 'Valor bruto dos pedidos criados (GMV)',
    category: METRIC_CATEGORY.FUNNEL,
    sourceEvents: ['MarketplaceOrder.Created'],
    sourceTables: ['marketplace_orders'],
    formula: "sum(amount) from marketplace_orders where created_at in [from, to), convertido reais -> centavos",
    notes:
      'Sempre inteiro (centavos), nunca ponto flutuante — conversão via shared/money (fromReais) no limite repositório/aplicação, nunca em aritmética JS solta.',
  },
  {
    key: 'releasedCustodyValueCents',
    name: 'Valor liberado da custódia (tranche original)',
    category: METRIC_CATEGORY.PAYMENT,
    sourceEvents: ['Funds.Released'],
    sourceTables: ['trust_custodies'],
    formula: "sum(amount) from trust_custodies where released_at in [from, to), convertido reais -> centavos",
    notes: 'Reconciliável 1:1 com PAY-004 — soma real das linhas liberadas, não um contador paralelo.',
  },

  // ---- Conversão entre estágios adjacentes ----
  {
    key: 'conversionRequestToMatch',
    name: 'Conversão Request -> Match',
    category: METRIC_CATEGORY.CONVERSION,
    sourceEvents: ['ServiceRequest.Created', 'ServiceRequest.Matched'],
    sourceTables: ['service_requests'],
    formula: 'requestsMatched / requestsCreated (null quando requestsCreated = 0)',
    notes: 'Calculada em memória a partir dos DOIS contadores acima — nunca um terceiro contador próprio.',
  },
  {
    key: 'conversionOfferToOrder',
    name: 'Conversão Offer -> Contract',
    category: METRIC_CATEGORY.CONVERSION,
    sourceEvents: ['MarketplaceOffer.Created', 'MarketplaceOrder.Created'],
    sourceTables: ['marketplace_offers', 'marketplace_orders'],
    formula: 'ordersCreated / offersCreated (null quando offersCreated = 0)',
    notes:
      'Aproximação por período, não por proposta individual — uma proposta aceita no período pode ter sido criada num período anterior. Documentado, não escondido (ver notas do relatório de conclusão).',
  },
  {
    key: 'conversionOrderToExecution',
    name: 'Conversão Contract -> Execution',
    category: METRIC_CATEGORY.CONVERSION,
    sourceEvents: ['MarketplaceOrder.Created', 'MarketplaceOrder.ExecutionCompleted'],
    sourceTables: ['marketplace_orders'],
    formula: 'executionCompleted / ordersCreated (null quando ordersCreated = 0)',
    notes: 'Mesma tabela para os dois lados — nenhum join necessário.',
  },
  {
    key: 'conversionExecutionToConfirmation',
    name: 'Conversão Execution -> Confirmation',
    category: METRIC_CATEGORY.CONVERSION,
    sourceEvents: ['MarketplaceOrder.ExecutionCompleted', 'MarketplaceOrder.CustomerConfirmed'],
    sourceTables: ['marketplace_orders'],
    formula: 'customerConfirmed / executionCompleted (null quando executionCompleted = 0)',
    notes: '—',
  },
  {
    key: 'conversionConfirmationToPayment',
    name: 'Conversão Confirmation -> Payment',
    category: METRIC_CATEGORY.CONVERSION,
    sourceEvents: ['MarketplaceOrder.CustomerConfirmed', 'Funds.Released'],
    sourceTables: ['marketplace_orders', 'trust_custodies'],
    formula: 'paymentsReleased / customerConfirmed (null quando customerConfirmed = 0)',
    notes:
      'A liberação (PAY-004) é assíncrona em relação à confirmação — pode haver defasagem de fim de período entre o numerador e o denominador; aceitável para Release 1, documentado explicitamente.',
  },

  // ---- Tempo ----
  {
    key: 'avgTimeToFirstOfferMinutes',
    name: 'Tempo médio até a primeira proposta',
    category: METRIC_CATEGORY.TIMING,
    sourceEvents: ['MarketplaceConversation.Created', 'MarketplaceOffer.Created'],
    sourceTables: ['marketplace_conversations', 'marketplace_offers'],
    formula:
      'avg(min(offer.created_at) - conversation.started_at) em minutos, por conversa iniciada em [from, to) que recebeu ao menos uma proposta',
    notes:
      'Generaliza para qualquer conversa (nascida de contato direto em anúncio OU de engajamento de ServiceRequest, IP-003) — o relógio começa no primeiro contato real, não na criação do ServiceRequest, porque uma conversa pode nascer sem ServiceRequest (contato direto no anúncio).',
  },
  {
    key: 'avgPartnerResponseMinutes',
    name: 'Tempo médio de resposta do Trust Partner',
    category: METRIC_CATEGORY.TIMING,
    sourceEvents: ['MarketplaceConversation.Created', 'MarketplaceMessage.Sent'],
    sourceTables: ['marketplace_conversations', 'marketplace_messages'],
    formula:
      'avg(min(message.sent_at) where message.sender_id = conversation.seller_id) - conversation.started_at, em minutos, por conversa iniciada em [from, to)',
    notes:
      'Mede a resposta do lado vendedor (o contato é sempre iniciado pelo Member/buyer, MRK-006) — primeira mensagem do Partner na conversa, não a primeira proposta (a proposta pode nunca vir; a mensagem é o sinal de responsividade mais cedo disponível).',
  },

  // ---- Desfechos ----
  {
    key: 'completionRate',
    name: 'Taxa de conclusão',
    category: METRIC_CATEGORY.OUTCOME,
    sourceEvents: ['MarketplaceOrder.Completed', 'MarketplaceOrder.Cancelled'],
    sourceTables: ['marketplace_orders'],
    formula:
      "count(status in ('COMPLETED','CLOSED')) / count(*) from marketplace_orders where created_at in [from, to)",
    notes: 'status é o estado ATUAL (na hora da consulta), não o estado no momento da criação.',
  },
  {
    key: 'cancellationRate',
    name: 'Taxa de cancelamento',
    category: METRIC_CATEGORY.OUTCOME,
    sourceEvents: ['MarketplaceOrder.Cancelled'],
    sourceTables: ['marketplace_orders'],
    formula: "count(status = 'CANCELLED') / count(*) from marketplace_orders where created_at in [from, to)",
    notes: '—',
  },
  {
    key: 'disputeRate',
    name: 'Taxa de disputa',
    category: METRIC_CATEGORY.OUTCOME,
    sourceEvents: ['MarketplaceDispute.Opened'],
    sourceTables: ['marketplace_disputes', 'marketplace_orders'],
    formula:
      'count(distinct dispute.order_id) / count(order.id) — pedidos CRIADOS em [from, to) que tiveram ao menos uma disputa aberta (em qualquer momento)',
    notes:
      'Denominador = pedidos criados no período (não disputas abertas no período) — mede "de quem contratou nesse período, quantos disputaram", métrica operacional mais útil que uma taxa de disputas-por-disputas-no-período.',
  },
  {
    key: 'paymentSuccessRate',
    name: 'Taxa de sucesso de autorização de pagamento',
    category: METRIC_CATEGORY.PAYMENT,
    sourceEvents: ['Payment.Authorized', 'Payment.AuthorizationFailed'],
    sourceTables: ['payment_authorizations'],
    formula:
      "count(status = 'APPROVED') / count(*) from payment_authorizations where created_at in [from, to)",
    notes:
      'Cada TENTATIVA é uma linha (PAY-002 BR-003) — a taxa é sobre tentativas, não sobre pedidos (um pedido pode ter mais de uma tentativa de autorização).',
  },

  // ---- Adoção de Trust ----
  {
    key: 'trustPassportAdoptionRate',
    name: 'Adoção do Trust Passport',
    category: METRIC_CATEGORY.TRUST_ADOPTION,
    sourceEvents: ['TrustPassport.Created'],
    sourceTables: ['identities', 'trust_passports'],
    formula:
      'count(trust_passports where deleted_at is null) / count(identities where deleted_at is null) — estado ATUAL, não por período',
    notes:
      'Todo Identity ativado (Identity.Created na verificação de e-mail) ganha Passport automaticamente (TPS-001); a razão nunca deveria ser < 1 em operação normal — serve de sanity-check operacional.',
  },
  {
    key: 'trustLevelDistribution',
    name: 'Distribuição por nível de confiança',
    category: METRIC_CATEGORY.TRUST_ADOPTION,
    sourceEvents: ['TrustLevel.Changed'],
    sourceTables: ['trust_scores', 'identities'],
    formula:
      'group by level, count(*) from trust_scores join identities on identity_id where identities.deleted_at is null',
    notes: 'Estado atual (não histórico) — snapshot de quantas identidades ativas estão em cada nível hoje.',
  },
  {
    key: 'documentVerifiedShare',
    name: 'Parcela com documento verificado',
    category: METRIC_CATEGORY.TRUST_ADOPTION,
    sourceEvents: ['Verification.Approved'],
    sourceTables: ['trust_passports'],
    formula: "count(document_verified = true) / count(*) from trust_passports where deleted_at is null",
    notes:
      'Usa o BOOLEANO já projetado pelo TPS a partir de Verification.Approved/Rejected — nunca lê a tabela verifications/verification_evidences diretamente (fora de escopo — dado sensível de KYC, IP-021 §SENSITIVE_KYC_EVIDENCE).',
  },

  // ---- Coorte / retenção básica ----
  {
    key: 'cohortRetention',
    name: 'Retenção por coorte mensal de cadastro',
    category: METRIC_CATEGORY.RETENTION,
    sourceEvents: ['Identity.Created', 'MarketplaceOrder.Created'],
    sourceTables: ['identities', 'marketplace_orders'],
    formula:
      'para cada mês de cadastro M: cohortSize = count(identities com created_at no mês M); retainedMonth1 = count(distinct identities da coorte com >=1 pedido como comprador no mês M+1); retainedMonth2 = idem para M+2',
    notes:
      'Retenção básica de Release 1 (IP-020 §1 "cohort/retention basics") — não é RFM nem LTV; apenas "voltou a comprar depois do primeiro mês".',
  },
] as const;
