/** Tipos canônicos do Marketplace (MRK-001..008). Enums em UPPER_SNAKE_CASE (DOC-001). */

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

/** Estados do pedido. O Módulo 7 só cria em CREATED; o resto vem no Módulo 8. */
export const ORDER_STATUS = {
  CREATED: 'CREATED',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

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
