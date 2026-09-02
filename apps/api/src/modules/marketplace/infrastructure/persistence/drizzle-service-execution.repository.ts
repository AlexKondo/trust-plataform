import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import {
  ExecutionSessionStatus,
  PauseReasonCode,
} from '../../domain/entities/marketplace-types';
import {
  ServiceExecutionPause,
  ServiceExecutionSession,
} from '../../domain/entities/service-execution-session';
import { ServiceExecutionRepository } from '../../domain/repositories/service-execution.repository';
import {
  ServiceExecutionPauseRow,
  ServiceExecutionSessionRow,
  serviceExecutionPauses,
  serviceExecutionSessions,
} from './service-execution.schema';

@Injectable()
export class DrizzleServiceExecutionRepository extends ServiceExecutionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async saveSession(
    session: ServiceExecutionSession,
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const target = executor ?? this.db;
    const props = session.toProps();
    await target
      .insert(serviceExecutionSessions)
      .values(props)
      .onConflictDoUpdate({
        target: serviceExecutionSessions.id,
        // O pedido e o check-in são marcos permanentes; só o andamento muda.
        set: {
          status: props.status,
          checkInAt: props.checkInAt,
          checkInBy: props.checkInBy,
          checkOutAt: props.checkOutAt,
          checkOutBy: props.checkOutBy,
          elapsedMinutes: props.elapsedMinutes,
          pausedMinutes: props.pausedMinutes,
          updatedAt: props.updatedAt,
        },
      });
  }

  async findSessionByOrder(
    orderId: string,
    executor?: DatabaseExecutor,
  ): Promise<ServiceExecutionSession | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(serviceExecutionSessions)
      .where(eq(serviceExecutionSessions.orderId, orderId))
      .limit(1);
    return row ? toSession(row) : null;
  }

  async savePause(pause: ServiceExecutionPause, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = pause.toProps();
    await target
      .insert(serviceExecutionPauses)
      .values(props)
      .onConflictDoUpdate({
        target: serviceExecutionPauses.id,
        // Uma pausa só ganha fim; motivo, autor e início não são reescritos.
        set: { resumedAt: props.resumedAt, durationMinutes: props.durationMinutes },
      });
  }

  async findOpenPause(
    sessionId: string,
    executor?: DatabaseExecutor,
  ): Promise<ServiceExecutionPause | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(serviceExecutionPauses)
      .where(
        and(
          eq(serviceExecutionPauses.sessionId, sessionId),
          isNull(serviceExecutionPauses.resumedAt),
        ),
      )
      .limit(1);
    return row ? toPause(row) : null;
  }

  async listPauses(
    sessionId: string,
    executor?: DatabaseExecutor,
  ): Promise<ServiceExecutionPause[]> {
    const target = executor ?? this.db;
    const rows = await target
      .select()
      .from(serviceExecutionPauses)
      .where(eq(serviceExecutionPauses.sessionId, sessionId))
      .orderBy(asc(serviceExecutionPauses.pausedAt));
    return rows.map(toPause);
  }
}

function toSession(row: ServiceExecutionSessionRow): ServiceExecutionSession {
  return ServiceExecutionSession.restore({
    id: row.id,
    orderId: row.orderId,
    status: row.status as ExecutionSessionStatus,
    checkInAt: row.checkInAt,
    checkInBy: row.checkInBy,
    checkOutAt: row.checkOutAt,
    checkOutBy: row.checkOutBy,
    elapsedMinutes: row.elapsedMinutes,
    pausedMinutes: row.pausedMinutes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toPause(row: ServiceExecutionPauseRow): ServiceExecutionPause {
  return ServiceExecutionPause.restore({
    id: row.id,
    sessionId: row.sessionId,
    orderId: row.orderId,
    reasonCode: row.reasonCode as PauseReasonCode,
    note: row.note,
    performedBy: row.performedBy,
    pausedAt: row.pausedAt,
    resumedAt: row.resumedAt,
    durationMinutes: row.durationMinutes,
    createdAt: row.createdAt,
  });
}
