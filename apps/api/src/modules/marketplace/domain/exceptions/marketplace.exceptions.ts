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
