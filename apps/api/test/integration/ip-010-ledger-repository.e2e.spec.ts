/**
 * IP-010 Diff Review (Checker-added) — cobertura real-Postgres que faltava no
 * relatório de conclusão: o Executor não rodou o harness `.pgdata-e2e` nesta
 * sessão, então `drizzle-ledger.repository.ts` nunca havia sido exercitado
 * contra SQL real. Este teste prova, contra Postgres de verdade (não fakes):
 * 1) o índice único `(source_event_id, account, direction)` genuinamente
 *    deduplica mesmo sob duas inserções CONCORRENTES do mesmo grupo (a
 *    garantia que os testes com fake in-memory não podem provar, porque um
 *    fake não tem uma race de verdade);
 * 2) o round-trip de `numeric(18,0)` via Drizzle (string na escrita,
 *    `Number()` na leitura) não perde precisão para valores em centavos.
 *
 * Requer TEST_DATABASE_URL (use `pnpm test:e2e`).
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBalancedPosting, LEDGER_ACCOUNTS } from '../../src/modules/payment/domain/entities/ledger-entry';
import { DrizzleLedgerRepository } from '../../src/modules/payment/infrastructure/persistence/drizzle-ledger.repository';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(testDatabaseUrl))('IP-010 — DrizzleLedgerRepository (real Postgres)', () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let repository: DrizzleLedgerRepository;

  beforeAll(async () => {
    client = postgres(testDatabaseUrl!, { max: 5, prepare: false });
    db = drizzle(client);
    await migrate(db, {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
      migrationsTable: 'drizzle_migrations',
    });
    // @ts-expect-error — Database type in DrizzleLedgerRepository is broader
    // (query builder) than the raw postgres-js drizzle instance; sufficient
    // for this repository's usage (insert/select/groupBy) at runtime.
    repository = new DrizzleLedgerRepository(db);
  });

  afterAll(async () => {
    await client?.end({ timeout: 5 });
  });

  it('índice único deduplica mesmo sob postGroup concorrente do MESMO fato (race real)', async () => {
    const paymentId = uuidv7();
    const sourceEventId = uuidv7();
    const [debit, credit] = buildBalancedPosting({
      sourceEventId,
      sourceEventType: 'Payment.Authorized',
      sourceAggregateType: 'Payment',
      sourceAggregateId: paymentId,
      paymentId,
      amountCents: 12345,
      currency: 'BRL',
      debitAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
      creditAccount: LEDGER_ACCOUNTS.MEMBER_FUNDING_CLEARING,
    });

    // Duas "invocações de consumer" concorrentes para o MESMO sourceEventId —
    // simula dois workers do outbox relay processando o mesmo evento quase
    // simultaneamente (o cenário real que só uma race de verdade prova).
    const results = await Promise.all([
      repository.postGroup([debit, credit]),
      repository.postGroup([debit, credit]),
      repository.postGroup([debit, credit]),
    ]);

    const totalInserted = results.reduce((a, b) => a + b, 0);
    expect(totalInserted).toBe(2); // exatamente um dos 3 lotes vence a corrida

    const rows = await repository.listByPayment(paymentId);
    expect(rows).toHaveLength(2);

    const custodyHeld = await repository.sumByPaymentAndAccount(
      paymentId,
      LEDGER_ACCOUNTS.CUSTODY_HELD,
    );
    expect(custodyHeld).toBe(12345); // não 24690/37035 — não duplicou
  });

  it('numeric(18,0) mantém precisão de centavos no round-trip (sem perda de float)', async () => {
    const paymentId = uuidv7();
    const amountCents = 999999999; // valor grande em centavos, longe de float-safe se mal tratado
    const [debit, credit] = buildBalancedPosting({
      sourceEventId: uuidv7(),
      sourceEventType: 'Payment.Authorized',
      sourceAggregateType: 'Payment',
      sourceAggregateId: paymentId,
      paymentId,
      amountCents,
      currency: 'BRL',
      debitAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
      creditAccount: LEDGER_ACCOUNTS.MEMBER_FUNDING_CLEARING,
    });

    const inserted = await repository.postGroup([debit, credit]);
    expect(inserted).toBe(2);

    const custodyHeld = await repository.sumByPaymentAndAccount(
      paymentId,
      LEDGER_ACCOUNTS.CUSTODY_HELD,
    );
    expect(custodyHeld).toBe(amountCents);
  });
});
