import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { ChangeOrderEvidenceType, ChangeOrderStatus } from '../entities/marketplace-types';
import { TrustChangeOrder } from '../entities/trust-change-order';

/** PACK-03 §13 — metadado da evidência; o binário mora no storage. */
export interface ChangeOrderEvidenceRecord {
  id: string;
  changeOrderId: string;
  type: ChangeOrderEvidenceType;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  uploadedBy: string;
  uploadedAt: Date;
}

export abstract class TrustChangeOrderRepository {
  abstract create(changeOrder: TrustChangeOrder, executor?: DatabaseExecutor): Promise<void>;

  abstract findById(id: string, executor?: DatabaseExecutor): Promise<TrustChangeOrder | null>;

  abstract listByOrder(
    orderId: string,
    executor?: DatabaseExecutor,
  ): Promise<TrustChangeOrder[]>;

  /**
   * PACK-03 §19 — grava a transição **apenas** se o status no banco ainda for
   * `expectedStatus`, devolvendo `false` quando outra requisição chegou antes.
   * É o que impede aprovação dupla e a corrida aprovar-versus-rejeitar: a
   * checagem no aggregate resolve o caso de uma requisição só, esta resolve o
   * de duas simultâneas.
   */
  abstract saveWithExpectedStatus(
    changeOrder: TrustChangeOrder,
    expectedStatus: ChangeOrderStatus,
    executor?: DatabaseExecutor,
  ): Promise<boolean>;

  abstract addEvidence(
    record: ChangeOrderEvidenceRecord,
    executor?: DatabaseExecutor,
  ): Promise<void>;

  abstract listEvidences(
    changeOrderId: string,
    executor?: DatabaseExecutor,
  ): Promise<ChangeOrderEvidenceRecord[]>;
}
