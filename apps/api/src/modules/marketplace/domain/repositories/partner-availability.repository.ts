import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { PartnerAvailabilityWindow } from '../entities/partner-availability';

export abstract class PartnerAvailabilityRepository {
  /** Substitui o conjunto INTEIRO de janelas do Partner (delete + insert atômico). */
  abstract replaceForPartner(
    partnerId: string,
    windows: PartnerAvailabilityWindow[],
    executor?: DatabaseExecutor,
  ): Promise<void>;

  abstract listByPartner(partnerId: string): Promise<PartnerAvailabilityWindow[]>;
}
