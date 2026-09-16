import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { PrivacyRequest } from '../entities/privacy-request';

export abstract class PrivacyRequestRepository {
  abstract save(request: PrivacyRequest, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string): Promise<PrivacyRequest | null>;
  abstract listByIdentity(identityId: string): Promise<PrivacyRequest[]>;
}
