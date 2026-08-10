export * from './audit-logs';
export * from './outbox-events';
export * from './processed-events';
// Tabelas dos módulos de negócio (cada tabela pertence a um único módulo;
// o re-export aqui existe só para o Drizzle montar o schema completo do banco)
export * from '../../../modules/identity/infrastructure/persistence/identities.schema';
export * from '../../../modules/identity/infrastructure/persistence/email-verification-tokens.schema';
export * from '../../../modules/identity/infrastructure/persistence/sessions.schema';
export * from '../../../modules/identity/infrastructure/persistence/password-reset-tokens.schema';
export * from '../../../modules/trust-passport/infrastructure/persistence/trust-passports.schema';
export * from '../../../modules/verification/infrastructure/persistence/verifications.schema';
export * from '../../../modules/trust-score/infrastructure/persistence/trust-score.schema';
export * from '../../../modules/trust-score/infrastructure/persistence/trust-reputation.schema';
export * from '../../../modules/marketplace/infrastructure/persistence/marketplace.schema';
export * from '../../../modules/marketplace/infrastructure/persistence/marketplace-offer.schema';
export * from '../../../modules/marketplace/infrastructure/persistence/marketplace-order.schema';
export * from '../../../modules/marketplace/infrastructure/persistence/marketplace-review.schema';
export * from '../../../modules/notification/infrastructure/persistence/notifications.schema';
