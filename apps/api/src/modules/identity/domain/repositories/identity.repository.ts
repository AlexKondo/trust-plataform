import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { Identity } from '../entities/identity';

/**
 * Contrato de persistência da Identity (só persistência — zero regra de negócio).
 * Implementação em infrastructure/persistence. Consultas ignoram soft-deleted.
 */
export abstract class IdentityRepository {
  abstract save(identity: Identity, executor?: DatabaseExecutor): Promise<void>;
  /**
   * IP-002 — `executor` opcional: callers que já estão dentro de uma
   * transação (ex.: `EventConsumer.handle`, que roda com uma conexão do pool
   * já reservada) DEVEM passar o `tx` recebido, nunca deixar este método abrir
   * uma segunda conexão do mesmo pool — sob concorrência real isso esgota o
   * pool (transações seguram uma conexão cada e ainda pedem outra para o
   * `findById`) e trava indefinidamente. Ver `RuleNotificationConsumer.handle`.
   */
  abstract findById(id: string, executor?: DatabaseExecutor): Promise<Identity | null>;
  abstract findByEmail(email: string): Promise<Identity | null>;
  abstract existsByEmail(email: string): Promise<boolean>;
}
