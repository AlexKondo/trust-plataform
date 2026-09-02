import { DatabaseExecutor } from '../../../../shared/database/database.module';
import {
  ServiceExecutionPause,
  ServiceExecutionSession,
} from '../entities/service-execution-session';

export abstract class ServiceExecutionRepository {
  abstract saveSession(
    session: ServiceExecutionSession,
    executor?: DatabaseExecutor,
  ): Promise<void>;

  abstract findSessionByOrder(
    orderId: string,
    executor?: DatabaseExecutor,
  ): Promise<ServiceExecutionSession | null>;

  abstract savePause(pause: ServiceExecutionPause, executor?: DatabaseExecutor): Promise<void>;

  /**
   * PACK-03 §19 — no máximo uma pausa aberta por sessão. A garantia final é o
   * índice parcial `WHERE resumed_at IS NULL`; esta consulta existe para dar
   * mensagem de erro decente antes de o banco recusar.
   */
  abstract findOpenPause(
    sessionId: string,
    executor?: DatabaseExecutor,
  ): Promise<ServiceExecutionPause | null>;

  abstract listPauses(
    sessionId: string,
    executor?: DatabaseExecutor,
  ): Promise<ServiceExecutionPause[]>;
}
