import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { CommercialPolicy } from '../entities/commercial-policy';

export abstract class CommercialPolicyRepository {
  /**
   * A política comercial vigente: a linha mais recente de `commercial_policies`
   * (`ORDER BY created_at DESC LIMIT 1`). A tabela é append-only — nunca há
   * UPDATE — então "vigente" é sempre "a última inserida". `null` quando a
   * tabela está vazia (erro de configuração; ver
   * `CommercialPolicyNotConfiguredException`).
   */
  abstract findActive(executor?: DatabaseExecutor): Promise<CommercialPolicy | null>;
}
