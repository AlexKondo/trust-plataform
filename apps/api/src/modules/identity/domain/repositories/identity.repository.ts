import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { Identity } from '../entities/identity';

/**
 * Contrato de persistência da Identity (só persistência — zero regra de negócio).
 * Implementação em infrastructure/persistence. Consultas ignoram soft-deleted.
 */
export abstract class IdentityRepository {
  abstract save(identity: Identity, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string): Promise<Identity | null>;
  abstract findByEmail(email: string): Promise<Identity | null>;
  abstract existsByEmail(email: string): Promise<boolean>;
}
