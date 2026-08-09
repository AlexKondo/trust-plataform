import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { TrustPassport } from '../entities/trust-passport';

export abstract class TrustPassportRepository {
  abstract save(passport: TrustPassport, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string): Promise<TrustPassport | null>;
  abstract findByIdentityId(identityId: string): Promise<TrustPassport | null>;
  abstract existsByIdentityId(identityId: string): Promise<boolean>;
}
