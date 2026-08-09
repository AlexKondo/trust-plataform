/**
 * E2E do Módulo 0. Requer um PostgreSQL vazio/descartável:
 *   TEST_DATABASE_URL=postgresql://... pnpm test
 * Sem a variável, a suíte inteira é pulada (não há Docker garantido na máquina local;
 * no CI o Postgres 16 é um service container).
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/main';
import { AuditLogService } from '../../src/shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../src/shared/database/database.module';
import { auditLogs, outboxEvents } from '../../src/shared/database/schema';
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';
import { OutboxService } from '../../src/shared/events/outbox.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(testDatabaseUrl))('Módulo 0 — e2e', () => {
  let app: NestFastifyApplication;

  // Env de teste (DATABASE_URL, chaves JWT etc.) é definida em test/setup-env.ts,
  // que roda ANTES dos imports — ConfigModule.forRoot executa no import do AppModule.
  beforeAll(async () => {
    const client = postgres(testDatabaseUrl!, { max: 1, prepare: false });
    await migrate(drizzle(client), {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
      migrationsTable: 'drizzle_migrations',
    });
    await client.end({ timeout: 5 });

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/health responde no envelope com banco UP', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; data: { status: string; database: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('UP');
    expect(body.data.database).toBe('UP');
  });

  it('devolve X-Request-Id e ecoa X-Correlation-Id do chamador', async () => {
    const correlationId = uuidv7();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-correlation-id': correlationId },
    });
    expect(response.headers['x-correlation-id']).toBe(correlationId);
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('rota inexistente responde 404 no envelope de erro', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/nao-existe' });
    expect(response.statusCode).toBe(404);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('outbox: evento enfileirado é publicado e marcado como PUBLISHED', async () => {
    const outbox = app.get(OutboxService);
    const relay = app.get(OutboxRelayService);
    const db = app.get<Database>(DRIZZLE);

    const envelope = await outbox.enqueueStandalone({
      eventName: 'ModuleZero.Bootstrapped',
      payload: { note: 'integration-test' },
      producer: 'trust-api',
      correlationId: uuidv7(),
    });

    // O relay processa em lotes de 50 (mais antigos primeiro) — em um banco de
    // dev com backlog pode levar mais de um ciclo até chegar neste evento.
    let row: typeof outboxEvents.$inferSelect | undefined;
    for (let i = 0; i < 20; i += 1) {
      await relay.tick();
      [row] = await db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.eventId, envelope.eventId));
      if (row?.status === 'PUBLISHED') {
        break;
      }
    }
    expect(row?.status).toBe('PUBLISHED');
    expect(row?.publishedAt).toBeInstanceOf(Date);
  });

  it('audit_logs: grava e o trigger bloqueia UPDATE/DELETE (append-only)', async () => {
    const audit = app.get(AuditLogService);
    const db = app.get<Database>(DRIZZLE);
    const correlationId = uuidv7();

    await audit.record({
      operation: 'BootstrapModuleZero',
      resource: 'Platform',
      result: 'SUCCESS',
      correlationId,
    });

    const [row] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.correlationId, correlationId));
    expect(row).toBeDefined();

    // O Drizzle envelopa o erro do Postgres ("audit_logs is append-only") em
    // "Failed query" — basta garantir que UPDATE/DELETE falham e nada muda.
    await expect(
      db.update(auditLogs).set({ result: 'FAILURE' }).where(eq(auditLogs.id, row!.id)),
    ).rejects.toThrow();
    await expect(db.delete(auditLogs).where(eq(auditLogs.id, row!.id))).rejects.toThrow();

    const [unchanged] = await db.select().from(auditLogs).where(eq(auditLogs.id, row!.id));
    expect(unchanged?.result).toBe('SUCCESS');
  });
});
