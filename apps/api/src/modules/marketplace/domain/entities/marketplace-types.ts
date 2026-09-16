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

// ── PACK-03 — Trust Change Order & Time Billing ─────────────────────────────

/**
 * PACK-03 §7 — tipos de mudança comercial suportados. MATERIAL sempre carrega
 * custo e markup SEPARADOS (§7.3): colapsar os dois num valor opaco esconderia
 * exatamente a informação que decide se há Trust Fee.
 */
export const CHANGE_ORDER_TYPE = {
  ADDITIONAL_TIME: 'ADDITIONAL_TIME',
  SCOPE_CHANGE: 'SCOPE_CHANGE',
  MATERIAL: 'MATERIAL',
  MIXED: 'MIXED',
} as const;

export type ChangeOrderType = (typeof CHANGE_ORDER_TYPE)[keyof typeof CHANGE_ORDER_TYPE];

export const CHANGE_ORDER_TYPES = [
  CHANGE_ORDER_TYPE.ADDITIONAL_TIME,
  CHANGE_ORDER_TYPE.SCOPE_CHANGE,
  CHANGE_ORDER_TYPE.MATERIAL,
  CHANGE_ORDER_TYPE.MIXED,
] as const;

/** PACK-03 §6 — ciclo de vida do Change Order. APPROVED e REJECTED são terminais. */
export const CHANGE_ORDER_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_MEMBER_APPROVAL: 'PENDING_MEMBER_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUS)[keyof typeof CHANGE_ORDER_STATUS];

/**
 * §6.1 — `APPROVED` é terminal e IMUTÁVEL: correção exige Change Order novo,
 * nunca reescrita do histórico. `CANCELLED` só antes da decisão.
 */
export const CHANGE_ORDER_TRANSITIONS: Readonly<
  Record<ChangeOrderStatus, readonly ChangeOrderStatus[]>
> = {
  DRAFT: [
    CHANGE_ORDER_STATUS.PENDING_MEMBER_APPROVAL,
    CHANGE_ORDER_STATUS.CANCELLED,
    CHANGE_ORDER_STATUS.EXPIRED,
  ],
  PENDING_MEMBER_APPROVAL: [
    CHANGE_ORDER_STATUS.APPROVED,
    CHANGE_ORDER_STATUS.REJECTED,
    CHANGE_ORDER_STATUS.CANCELLED,
    CHANGE_ORDER_STATUS.EXPIRED,
  ],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

/**
 * §24 — estados do pedido em que uma mudança comercial ainda faz sentido: o
 * serviço está contratado e ainda não foi confirmado pelo cliente. Depois da
 * confirmação a conta está fechada; antes do agendamento, o caminho é
 * renegociar a proposta, não emendar o contrato.
 */
export const CHANGE_ORDER_ELIGIBLE_ORDER_STATUSES: readonly OrderStatus[] = [
  ORDER_STATUS.SCHEDULED,
  ORDER_STATUS.AWAITING_EXECUTION,
  ORDER_STATUS.IN_PROGRESS,
  ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION,
];

/** §13 — natureza da evidência anexada a um Change Order. */
export const CHANGE_ORDER_EVIDENCE_TYPE = {
  PHOTO: 'PHOTO',
  RECEIPT: 'RECEIPT',
  QUOTE: 'QUOTE',
  DOCUMENT: 'DOCUMENT',
  OTHER: 'OTHER',
} as const;

export type ChangeOrderEvidenceType =
  (typeof CHANGE_ORDER_EVIDENCE_TYPE)[keyof typeof CHANGE_ORDER_EVIDENCE_TYPE];

export const CHANGE_ORDER_EVIDENCE_TYPES = [
  CHANGE_ORDER_EVIDENCE_TYPE.PHOTO,
  CHANGE_ORDER_EVIDENCE_TYPE.RECEIPT,
  CHANGE_ORDER_EVIDENCE_TYPE.QUOTE,
  CHANGE_ORDER_EVIDENCE_TYPE.DOCUMENT,
  CHANGE_ORDER_EVIDENCE_TYPE.OTHER,
] as const;

/** PACK-03 §10 — ciclo da sessão de execução (não é status do pedido). */
export const EXECUTION_SESSION_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
} as const;

export type ExecutionSessionStatus =
  (typeof EXECUTION_SESSION_STATUS)[keyof typeof EXECUTION_SESSION_STATUS];

export const EXECUTION_SESSION_TRANSITIONS: Readonly<
  Record<ExecutionSessionStatus, readonly ExecutionSessionStatus[]>
> = {
  NOT_STARTED: [EXECUTION_SESSION_STATUS.ACTIVE],
  ACTIVE: [EXECUTION_SESSION_STATUS.PAUSED, EXECUTION_SESSION_STATUS.COMPLETED],
  // §10.4: check-out com pausa aberta é permitido — a pausa é fechada no
  // próprio check-out. Recusar deixaria o prestador preso numa sessão viva.
  PAUSED: [EXECUTION_SESSION_STATUS.ACTIVE, EXECUTION_SESSION_STATUS.COMPLETED],
  COMPLETED: [],
};

/** §10.2 — motivos de pausa. Nada aqui é inferido automaticamente do aparelho. */
export const PAUSE_REASON_CODE = {
  PERSONAL_BREAK: 'PERSONAL_BREAK',
  PERSONAL_CALL: 'PERSONAL_CALL',
  MEAL: 'MEAL',
  OTHER_NON_BILLABLE: 'OTHER_NON_BILLABLE',
} as const;

export type PauseReasonCode = (typeof PAUSE_REASON_CODE)[keyof typeof PAUSE_REASON_CODE];

export const PAUSE_REASON_CODES = [
  PAUSE_REASON_CODE.PERSONAL_BREAK,
  PAUSE_REASON_CODE.PERSONAL_CALL,
  PAUSE_REASON_CODE.MEAL,
  PAUSE_REASON_CODE.OTHER_NON_BILLABLE,
] as const;

// ── IP-003 — Service Request, Discovery & Matching ──────────────────────────

/**
 * IP-003 — ciclo de vida do pedido de serviço do Trust Member. Deliberadamente
 * menor que ORDER_STATUS: um ServiceRequest só existe até o Member escolher um
 * Trust Partner e a conversa nascer — dali em diante quem manda é o ciclo já
 * existente de MarketplaceConversation/MarketplaceOffer/MarketplaceOrder (esta
 * IP não duplica esse fluxo, só linka nele — ver ServiceRequestEngagement).
 *
 * `EXPIRED` nunca é gravado — é DERIVADO de `expiresAt`, exatamente como o
 * `MarketplaceOffer.effectiveStatus()` já faz (mesmo motivo: não existe job de
 * varredura no MVP, INCONSISTENCIAS #33).
 */
export const SERVICE_REQUEST_STATUS = {
  OPEN: 'OPEN',
  MATCHED: 'MATCHED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type ServiceRequestStatus =
  (typeof SERVICE_REQUEST_STATUS)[keyof typeof SERVICE_REQUEST_STATUS];

/**
 * `OPEN -> MATCHED` acontece na primeira vez que o Member engaja um Partner
 * elegível (`ServiceRequest.markMatched`) e NÃO impede novos engajamentos —
 * "matched" é só um fato informativo ("pelo menos um contato já foi feito"),
 * não uma reserva exclusiva (isso é papel do MarketplaceListing.reserve() no
 * aceite de proposta, que esta IP não toca). `CLOSED`/`CANCELLED` são finais.
 */
export const SERVICE_REQUEST_TRANSITIONS: Readonly<
  Record<ServiceRequestStatus, readonly ServiceRequestStatus[]>
> = {
  OPEN: [SERVICE_REQUEST_STATUS.MATCHED, SERVICE_REQUEST_STATUS.CLOSED, SERVICE_REQUEST_STATUS.CANCELLED],
  MATCHED: [SERVICE_REQUEST_STATUS.CLOSED, SERVICE_REQUEST_STATUS.CANCELLED],
  CLOSED: [],
  CANCELLED: [],
  EXPIRED: [],
};

/** Status em que o pedido ainda aceita novos engajamentos com Partners. */
export const SERVICE_REQUEST_ENGAGEABLE_STATUSES: readonly ServiceRequestStatus[] = [
  SERVICE_REQUEST_STATUS.OPEN,
  SERVICE_REQUEST_STATUS.MATCHED,
];

/**
 * IP-003 §"timing/scheduling constraint" — restrição de tempo deliberadamente
 * simples (enum + data opcional). Agenda/disponibilidade real é IP-005; este
 * campo é só um sinal de urgência que o Member declara ao descrever a necessidade.
 */
export const URGENCY_LEVEL = {
  ASAP: 'ASAP',
  THIS_WEEK: 'THIS_WEEK',
  FLEXIBLE: 'FLEXIBLE',
} as const;

export type UrgencyLevel = (typeof URGENCY_LEVEL)[keyof typeof URGENCY_LEVEL];

export const URGENCY_LEVELS = [
  URGENCY_LEVEL.ASAP,
  URGENCY_LEVEL.THIS_WEEK,
  URGENCY_LEVEL.FLEXIBLE,
] as const;

// ── IP-005 — Scheduling, Availability, Location & ETA ───────────────────────

/**
 * Dia da semana no mesmo mapeamento de `Intl.DateTimeFormat`/JS `Date#getDay()`:
 * 0 = domingo ... 6 = sábado. Usado pela janela de disponibilidade do Partner
 * (BR do IP-005: "quando eu costumo estar disponível", não reação por pedido).
 */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * IP-005 — de onde veio a estimativa de chegada. `PARTNER_DECLARED` é a única
 * fonte real na Release 1 (nenhum provedor de mapas está configurado —
 * `.env.example` não declara nenhuma chave de geocoding/roteamento).
 * `PROVIDER_COMPUTED` já existe no vocabulário para quando um adapter real for
 * ligado atrás do mesmo `EtaEstimatorPort`, sem qualquer mudança de domínio.
 */
export const ETA_SOURCE = {
  PARTNER_DECLARED: 'PARTNER_DECLARED',
  PROVIDER_COMPUTED: 'PROVIDER_COMPUTED',
} as const;

export type EtaSource = (typeof ETA_SOURCE)[keyof typeof ETA_SOURCE];

/**
 * IP-005 — status de deslocamento do Partner até o local do serviço.
 * Deliberadamente um modelo de TRANSIÇÃO DECLARADA ("saí" / "cheguei"), nunca
 * rastreamento contínuo de GPS: não existe fornecedor de mapas configurado, e
 * o mandato proíbe explicitamente "rastreamento invasivo em segundo plano" e
 * vazar localização precisa contínua além da necessidade (Shared Standards §7).
 * O check-in/check-out do MRK-020/021 continua sendo o único lugar do sistema
 * com coordenadas reais — este status não introduz nenhuma coordenada nova,
 * só um enum de 3 estados + uma estimativa de minutos declarada pelo Partner.
 */
export const TRAVEL_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
} as const;

export type TravelStatus = (typeof TRAVEL_STATUS)[keyof typeof TRAVEL_STATUS];
