/** Tipos canônicos do Marketplace (MRK-001..008). Enums em UPPER_SNAKE_CASE (DOC-001). */

/**
 * PACK-02 §4 — modelos comerciais da proposta. FIXED_PRICE é o comportamento
 * legado (valor fechado); HOURLY adiciona taxa/hora + duração mínima, com o
 * valor inicial derivado (nunca proposto diretamente — ver hourly-pricing.service.ts).
 */
export const PRICING_MODEL = {
  FIXED_PRICE: 'FIXED_PRICE',
  HOURLY: 'HOURLY',
} as const;

export type PricingModel = (typeof PRICING_MODEL)[keyof typeof PRICING_MODEL];

export const PRICING_MODELS = [PRICING_MODEL.FIXED_PRICE, PRICING_MODEL.HOURLY] as const;

export const LISTING_TYPE = {
  PRODUCT: 'PRODUCT',
  SERVICE: 'SERVICE',
} as const;

export type ListingType = (typeof LISTING_TYPE)[keyof typeof LISTING_TYPE];

export const LISTING_TYPES = [LISTING_TYPE.PRODUCT, LISTING_TYPE.SERVICE] as const;

/**
 * Ciclo de vida do anúncio. O Módulo 6 usa DRAFT/PUBLISHED; RESERVED entra com
 * os pedidos (Módulo 8, INCONSISTENCIAS #12) e SUSPENDED/EXPIRED/REMOVED com a
 * moderação — já declarados aqui para a máquina de estados nascer completa.
 */
export const LISTING_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  RESERVED: 'RESERVED',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  REMOVED: 'REMOVED',
} as const;

export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS];

/** MRK-004 BR-001/002 e MRK-005 BR-001: só PUBLISHED aparece para o público. */
export const PUBLICLY_VISIBLE_STATUSES: ListingStatus[] = [LISTING_STATUS.PUBLISHED];

/** Status em que o dono ainda pode editar o conteúdo (MRK-002). */
export const EDITABLE_STATUSES: ListingStatus[] = [
  LISTING_STATUS.DRAFT,
  LISTING_STATUS.PUBLISHED,
  LISTING_STATUS.SUSPENDED,
];

export const CONVERSATION_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type ConversationStatus = (typeof CONVERSATION_STATUS)[keyof typeof CONVERSATION_STATUS];

/**
 * Estados da proposta (MRK-009..014). **Não existe `CANCELLED`** — a spec o
 * cita mas nunca o cria (INCONSISTENCIAS #10).
 * PENDING → ACCEPTED | REJECTED | WITHDRAWN | COUNTERED | EXPIRED | CLOSED
 * (`CLOSED` = encerrada por tabela quando outra proposta da mesma negociação
 * foi aceita — MRK-013 BR-004).
 */
export const OFFER_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  COUNTERED: 'COUNTERED',
  EXPIRED: 'EXPIRED',
  CLOSED: 'CLOSED',
} as const;

export type OfferStatus = (typeof OFFER_STATUS)[keyof typeof OFFER_STATUS];

/**
 * Máquina de estados do pedido — 13 estados, incluindo `CUSTOMER_CONFIRMED`
 * (INCONSISTENCIAS #8: a confirmação do cliente é marco de negócio próprio,
 * não um efeito colateral do check-out).
 */
export const ORDER_STATUS = {
  CREATED: 'CREATED',
  AWAITING_SCHEDULING: 'AWAITING_SCHEDULING',
  SCHEDULED: 'SCHEDULED',
  AWAITING_EXECUTION: 'AWAITING_EXECUTION',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_CUSTOMER_CONFIRMATION: 'AWAITING_CUSTOMER_CONFIRMATION',
  CUSTOMER_CONFIRMED: 'CUSTOMER_CONFIRMED',
  COMPLETED: 'COMPLETED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
  DISPUTE_OPEN: 'DISPUTE_OPEN',
  DISPUTE_RESOLVED: 'DISPUTE_RESOLVED',
  REFUNDED: 'REFUNDED',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/**
 * Transições válidas (MRK-017 BR-003/BR-004: nenhum salto de estado).
 * As saídas para DISPUTE_* e REFUNDED já estão declaradas para a máquina nascer
 * completa, mas quem as dispara é o Módulo 9.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  CREATED: [ORDER_STATUS.AWAITING_SCHEDULING, ORDER_STATUS.SCHEDULED, ORDER_STATUS.CANCELLED],
  AWAITING_SCHEDULING: [ORDER_STATUS.SCHEDULED, ORDER_STATUS.CANCELLED],
  SCHEDULED: [
    ORDER_STATUS.AWAITING_EXECUTION,
    ORDER_STATUS.IN_PROGRESS,
    ORDER_STATUS.CANCELLED,
  ],
  AWAITING_EXECUTION: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.CANCELLED],
  IN_PROGRESS: [ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION, ORDER_STATUS.DISPUTE_OPEN],
  AWAITING_CUSTOMER_CONFIRMATION: [ORDER_STATUS.CUSTOMER_CONFIRMED, ORDER_STATUS.DISPUTE_OPEN],
  // MRK-023 §6.3 exige explicitamente CUSTOMER_CONFIRMED → DISPUTE_OPEN:
  // o cliente pode descobrir um problema depois de já ter confirmado.
  CUSTOMER_CONFIRMED: [ORDER_STATUS.COMPLETED, ORDER_STATUS.DISPUTE_OPEN],
  COMPLETED: [ORDER_STATUS.CLOSED, ORDER_STATUS.DISPUTE_OPEN],
  CLOSED: [],
  CANCELLED: [],
  DISPUTE_OPEN: [ORDER_STATUS.DISPUTE_RESOLVED],
  DISPUTE_RESOLVED: [ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUNDED, ORDER_STATUS.CLOSED],
  REFUNDED: [ORDER_STATUS.CLOSED],
};

/**
 * MRK-018 BR-002 — cancelamento direto só antes da execução começar. A partir de
 * IN_PROGRESS o caminho é disputa ou autorização administrativa (Módulo 9).
 * Prazos, multas e taxas são política configurável (BR-008), fora desta regra.
 */
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  ORDER_STATUS.CREATED,
  ORDER_STATUS.AWAITING_SCHEDULING,
  ORDER_STATUS.SCHEDULED,
  ORDER_STATUS.AWAITING_EXECUTION,
];

export const SCHEDULING_STATUS = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
} as const;

export type SchedulingStatus = (typeof SCHEDULING_STATUS)[keyof typeof SCHEDULING_STATUS];

export const EXECUTION_EVENT_TYPE = {
  CHECK_IN: 'CHECK_IN',
  CHECK_OUT: 'CHECK_OUT',
} as const;

export type ExecutionEventType =
  (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE];

/** Ordenações aceitas na busca (MRK-004 BR-005). */
export const SEARCH_SORT = {
  RELEVANCE: 'relevance',
  RECENT: 'recent',
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
  TRUST_SCORE: 'trust_score',
} as const;

export type SearchSort = (typeof SEARCH_SORT)[keyof typeof SEARCH_SORT];

export const SEARCH_SORTS = [
  SEARCH_SORT.RELEVANCE,
  SEARCH_SORT.RECENT,
  SEARCH_SORT.PRICE_ASC,
  SEARCH_SORT.PRICE_DESC,
  SEARCH_SORT.TRUST_SCORE,
] as const;
