/* global process, console */
/**
 * Roda a suíte COMPLETA (unit + e2e) contra um Postgres embutido descartável —
 * mesmo cenário do CI, sem Docker e sem tocar no banco compartilhado do Supabase.
 * Uso: pnpm test:e2e
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const dataDir = resolve(import.meta.dirname, '../.pgdata-e2e');
rmSync(dataDir, { recursive: true, force: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'trust',
  password: 'trust',
  port: 55432,
  persistent: false,
});

console.log('Iniciando Postgres embutido (porta 55432)...');
await pg.initialise();
await pg.start();
await pg.createDatabase('trust_test');

const result = spawnSync('pnpm', ['vitest', 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    TEST_DATABASE_URL: 'postgresql://trust:trust@localhost:55432/trust_test',
  },
});

await pg.stop();
rmSync(dataDir, { recursive: true, force: true });
process.exit(result.status ?? 1);
