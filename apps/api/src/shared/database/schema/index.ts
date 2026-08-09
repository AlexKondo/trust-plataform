export * from './audit-logs';
export * from './outbox-events';
// Tabelas dos módulos de negócio (cada tabela pertence a um único módulo;
// o re-export aqui existe só para o Drizzle montar o schema completo do banco)
export * from '../../../modules/identity/infrastructure/persistence/identities.schema';
export * from '../../../modules/identity/infrastructure/persistence/email-verification-tokens.schema';
