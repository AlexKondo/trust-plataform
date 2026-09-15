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

  /**
   * IP-001 — fecha a pausa (Trust Resume) com compare-and-set: só grava se a
   * linha ainda estiver aberta (`resumed_at IS NULL`) no momento do UPDATE,
   * o mesmo padrão de `saveWithExpectedStatus` do Trust Change Order (§19).
   * Isso fecha a corrida de "double Resume": duas chamadas concorrentes podem
   * ler a mesma pausa aberta, mas só uma consegue fechá-la — a outra recebe
   * `false` e a use case trata como transição inválida.
   *
   * `pause` já deve ter recebido `.close(now)` (resumedAt/durationMinutes
   * calculados em memória); este método só persiste, de forma condicional.
   */
  abstract closePauseIfOpen(
    pause: ServiceExecutionPause,
    executor?: DatabaseExecutor,
  ): Promise<boolean>;

  abstract listPauses(
    sessionId: string,
    executor?: DatabaseExecutor,
  ): Promise<ServiceExecutionPause[]>;
}
