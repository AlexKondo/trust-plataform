import {
  BusinessRuleViolationException,
  EntityNotFoundException,
  ForbiddenOperationException,
  StateConflictException,
} from '../../../../shared/domain/exceptions/domain.exception';

// ── Anúncios (MRK-001..005) ─────────────────────────────────────────────────

export class MarketplaceListingNotFoundException extends EntityNotFoundException {
  readonly code = 'MARKETPLACE_LISTING_NOT_FOUND';

  constructor() {
    super('Marketplace listing not found.');
  }
}

/** MRK-002 BR-001 / MRK-003 BR-001: só o dono altera o anúncio → 403. */
export class MarketplaceListingOwnershipException extends ForbiddenOperationException {
  readonly code = 'MARKETPLACE_LISTING_FORBIDDEN';

  constructor() {
    super('Only the listing owner can perform this operation.');
  }
}

/** MRK-001 BR-002: categoria inexistente/inativa → 422. */
export class MarketplaceCategoryNotFoundException extends BusinessRuleViolationException {
  readonly code = 'MARKETPLACE_CATEGORY_NOT_FOUND';

  constructor(category: string) {
    super(`Marketplace category "${category}" does not exist or is not active.`);
  }
}

/** MRK-002: anúncio em estado que não aceita mais edição → 409. */
export class MarketplaceListingNotEditableException extends StateConflictException {
  readonly code = 'MARKETPLACE_LISTING_NOT_EDITABLE';

  constructor(status: string) {
    super(`A listing with status ${status} can no longer be edited.`);
  }
}

/** MRK-003 BR-002: publicar exige DRAFT → 409. */
export class MarketplaceListingAlreadyPublishedException extends StateConflictException {
  readonly code = 'MARKETPLACE_LISTING_ALREADY_PUBLISHED';

  constructor(status: string) {
    super(`Only DRAFT listings can be published; this listing is ${status}.`);
  }
}

/** MRK-003 BR-003: campos obrigatórios ausentes na publicação → 422. */
export class MarketplaceListingIncompleteException extends BusinessRuleViolationException {
  readonly code = 'MARKETPLACE_LISTING_INCOMPLETE';
  readonly missingFields: string[];

  constructor(missingFields: string[]) {
    super(`Listing is missing required fields: ${missingFields.join(', ')}.`);
    this.missingFields = missingFields;
  }
}

/** MRK-003 BR-004/BR-005: identidade inativa ou reputação insuficiente → 403. */
export class MarketplacePublicationNotAllowedException extends ForbiddenOperationException {
  readonly code = 'MARKETPLACE_PUBLICATION_NOT_ALLOWED';

  constructor(reason: string) {
    super(reason);
  }
}

/** MRK-013 BR-005: só anúncio publicado pode ser reservado pelo aceite → 409. */
export class MarketplaceListingNotAvailableForOrderException extends StateConflictException {
  readonly code = 'MARKETPLACE_LISTING_NOT_AVAILABLE';

  constructor(status: string) {
    super(`Listing is ${status} and can no longer be reserved for an order.`);
  }
}

/** MRK-005 BR-002 / MRK-006 BR-002: anúncio existe mas não está disponível → 404. */
export class MarketplaceListingUnavailableException extends EntityNotFoundException {
  readonly code = 'MARKETPLACE_LISTING_UNAVAILABLE';

  constructor() {
    super('Marketplace listing is not available.');
  }
}

// ── Conversas e mensagens (MRK-006..008) ────────────────────────────────────

export class MarketplaceConversationNotFoundException extends EntityNotFoundException {
  readonly code = 'MARKETPLACE_CONVERSATION_NOT_FOUND';

  constructor() {
    super('Marketplace conversation not found.');
  }
}

/** MRK-006 BR-003: o dono não conversa com o próprio anúncio → 422. */
export class CannotContactOwnListingException extends BusinessRuleViolationException {
  readonly code = 'CANNOT_CONTACT_OWN_LISTING';

  constructor() {
    super('You cannot start a conversation on your own listing.');
  }
}

/** MRK-007 BR-001 / MRK-008 BR-001: terceiro tentando acessar a conversa → 403. */
export class MarketplaceConversationAccessDeniedException extends ForbiddenOperationException {
  readonly code = 'MARKETPLACE_CONVERSATION_FORBIDDEN';

  constructor() {
    super('Only the buyer and the seller can access this conversation.');
  }
}

/** MRK-007 BR-002 / MRK-008 BR-003: conversa encerrada não recebe mensagens → 409. */
export class MarketplaceConversationClosedException extends StateConflictException {
  readonly code = 'MARKETPLACE_CONVERSATION_CLOSED';

  constructor() {
    super('This conversation is closed and can no longer receive messages.');
  }
}

/** MRK-008 BR-002: encerrar exige status OPEN → 409. */
export class MarketplaceConversationAlreadyClosedException extends StateConflictException {
  readonly code = 'MARKETPLACE_CONVERSATION_ALREADY_CLOSED';

  constructor() {
    super('This conversation has already been closed.');
  }
}

// ── Propostas (MRK-009..014) ────────────────────────────────────────────────

export class MarketplaceOfferNotFoundException extends EntityNotFoundException {
  readonly code = 'MARKETPLACE_OFFER_NOT_FOUND';

  constructor() {
    super('Marketplace offer not found.');
  }
}

/** MRK-009 BR-001 / MRK-010 BR-001 / MRK-011 BR-001: só quem propôs mexe → 403. */
export class MarketplaceOfferOwnershipException extends ForbiddenOperationException {
  readonly code = 'MARKETPLACE_OFFER_FORBIDDEN';

  constructor(message = 'Only the participant who created this offer can perform this operation.') {
    super(message);
  }
}

/** MRK-013 BR-001 / MRK-014 BR-001: decidir cabe a quem RECEBEU a proposta → 403. */
export class MarketplaceOfferNotRecipientException extends ForbiddenOperationException {
  readonly code = 'MARKETPLACE_OFFER_NOT_RECIPIENT';

  constructor() {
    super('Only the participant who received this offer can accept, reject or counter it.');
  }
}

/** Operação exige proposta PENDING; ela já teve desfecho → 409. */
export class MarketplaceOfferAlreadyResolvedException extends StateConflictException {
  readonly code = 'MARKETPLACE_OFFER_ALREADY_RESOLVED';

  constructor(status: string) {
    super(`This offer is ${status}; only PENDING offers can be changed or decided.`);
  }
}

/** MRK-009 BR-007: proposta vencida não produz mais efeitos → 409. */
export class MarketplaceOfferExpiredException extends StateConflictException {
  readonly code = 'MARKETPLACE_OFFER_EXPIRED';

  constructor() {
    super('This offer has expired.');
  }
}

/** Uma proposta viva por vez em cada negociação (MRK-009 §6.3) → 409. */
export class MarketplaceOfferAlreadyExistsException extends StateConflictException {
  readonly code = 'MARKETPLACE_OFFER_ALREADY_EXISTS';

  constructor() {
    super('This conversation already has a pending offer; update, withdraw or decide it first.');
  }
}

// ── Pedidos (MRK-015..022) ──────────────────────────────────────────────────

export class MarketplaceOrderNotFoundException extends EntityNotFoundException {
  readonly code = 'MARKETPLACE_ORDER_NOT_FOUND';

  constructor() {
    super('Marketplace order not found.');
  }
}

/** MRK-016 BR-001: só comprador e vendedor acessam o pedido → 403. */
export class MarketplaceOrderAccessDeniedException extends ForbiddenOperationException {
  readonly code = 'MARKETPLACE_ORDER_FORBIDDEN';

  constructor(message = 'Only the buyer and the seller can access this order.') {
    super(message);
  }
}

/** MRK-017 BR-003/BR-004: salto de estado não permitido → 409. */
export class MarketplaceOrderTransitionException extends StateConflictException {
  readonly code = 'MARKETPLACE_ORDER_INVALID_TRANSITION';

  constructor(from: string, to: string) {
    super(`Order cannot move from ${from} to ${to}.`);
  }
}

/** MRK-018 BR-002: estado atual não admite cancelamento direto → 409. */
export class MarketplaceOrderCancellationNotAllowedException extends StateConflictException {
  readonly code = 'MARKETPLACE_ORDER_CANCELLATION_NOT_ALLOWED';

  constructor(status: string) {
    super(
      `An order in ${status} cannot be cancelled directly; open a dispute or request administrative review.`,
    );
  }
}

/** MRK-019 BR-004: agenda do prestador já ocupada na janela pedida → 409. */
export class SchedulingConflictException extends StateConflictException {
  readonly code = 'MARKETPLACE_SCHEDULING_CONFLICT';

  constructor() {
    super('The provider already has another service scheduled in this time window.');
  }
}

/** MRK-019 BR-002: janela de agendamento inválida → 422. */
export class InvalidSchedulingWindowException extends BusinessRuleViolationException {
  readonly code = 'MARKETPLACE_INVALID_SCHEDULING_WINDOW';

  constructor(message: string) {
    super(message);
  }
}

// ── Disputas e avaliações (MRK-023..025) ────────────────────────────────────

export class MarketplaceDisputeNotFoundException extends EntityNotFoundException {
  readonly code = 'MARKETPLACE_DISPUTE_NOT_FOUND';

  constructor() {
    super('Marketplace dispute not found.');
  }
}

/** MRK-023 BR-002: uma disputa ativa por pedido → 409. */
export class MarketplaceDisputeAlreadyOpenException extends StateConflictException {
  readonly code = 'MARKETPLACE_DISPUTE_ALREADY_OPEN';

  constructor() {
    super('This order already has an active dispute.');
  }
}

/** MRK-024 BR-002/BR-006: decisão é definitiva → 409. */
export class MarketplaceDisputeAlreadyResolvedException extends StateConflictException {
  readonly code = 'MARKETPLACE_DISPUTE_ALREADY_RESOLVED';

  constructor() {
    super('This dispute has already been resolved; decisions are final.');
  }
}

/** MRK-023 BR-003/BR-004: dados da disputa inválidos → 422. */
export class MarketplaceDisputeValidationException extends BusinessRuleViolationException {
  readonly code = 'MARKETPLACE_DISPUTE_INVALID';

  constructor(message: string) {
    super(message);
  }
}

/** MRK-025 BR-002: um participante avalia uma vez por pedido → 409. */
export class MarketplaceReviewAlreadyExistsException extends StateConflictException {
  readonly code = 'MARKETPLACE_REVIEW_ALREADY_EXISTS';

  constructor() {
    super('You have already reviewed this transaction.');
  }
}

/** MRK-025 BR-003: pedido ainda não chegou a um estado avaliável → 409. */
export class MarketplaceReviewNotAllowedException extends StateConflictException {
  readonly code = 'MARKETPLACE_REVIEW_NOT_ALLOWED';

  constructor(status: string) {
    super(`An order in ${status} cannot be reviewed yet.`);
  }
}

/** MRK-025 BR-004/BR-005: notas fora da escala → 422. */
export class MarketplaceReviewValidationException extends BusinessRuleViolationException {
  readonly code = 'MARKETPLACE_REVIEW_INVALID';

  constructor(message: string) {
    super(message);
  }
}

/** MRK-009 BR-004/005: dados da proposta violam as regras → 422. */
export class MarketplaceOfferValidationException extends BusinessRuleViolationException {
  readonly code = 'MARKETPLACE_OFFER_INVALID';

  constructor(message: string) {
    super(message);
  }
}

// ── Comercial e Trust Fee (PACK-02) ─────────────────────────────────────────

/** PACK-02 §15: totais do snapshot comercial inconsistentes → 422. */
export class MarketplaceCommercialSnapshotValidationException extends BusinessRuleViolationException {
  readonly code = 'MARKETPLACE_COMMERCIAL_SNAPSHOT_INVALID';

  constructor(message: string) {
    super(message);
  }
}

/**
 * PACK-02 §6/§10: não há política comercial (Trust Fee) configurada. Não
 * deveria acontecer em runtime real — a migration 0026 semeia uma linha —
 * mas é um erro de configuração explícito, não uma adivinhação de negócio.
 */
export class CommercialPolicyNotConfiguredException extends BusinessRuleViolationException {
  readonly code = 'COMMERCIAL_POLICY_NOT_CONFIGURED';

  constructor() {
    super('No active commercial policy (Trust Fee configuration) is configured.');
  }
}
