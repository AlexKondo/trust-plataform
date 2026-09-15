/* global process, console, setTimeout */
/**
 * Roda a suíte COMPLETA (unit + e2e) contra um Postgres embutido descartável —
 * mesmo cenário do CI, sem Docker e sem tocar no banco compartilhado do Supabase.
 * Uso: pnpm test:e2e
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * IP-001 — no Windows, o processo do Postgres embutido pode levar um instante
 * para soltar os handles do diretório de dados depois de `pg.stop()` (o
 * `await` resolve, mas o SO ainda não terminou de liberar o arquivo). Sem
 * retry, o `rmSync` seguinte falha com EBUSY e derruba o processo com exit
 * != 0 mesmo com a suíte inteira verde — um falso negativo local, só nesta
 * plataforma (o CI roda em ubuntu-latest e nunca passa por este arquivo).
 * `force: true` só suprime ENOENT (caminho ausente); EBUSY continua propagando.
 */
function removeDataDirWithRetry(dir, attempts = 5, delayMs = 300) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const busy = error?.code === 'EBUSY' || error?.code === 'ENOTEMPTY';
      if (!busy || attempt === attempts) {
        if (busy) {
          // Best-effort: um diretório temporário que o SO ainda não liberou
          // não deve mascarar um resultado de teste já reportado.
          console.warn(`Aviso: não foi possível remover ${dir} (${error.code}). Ignorando.`);
          return;
        }
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
}

/**
 * IP-001 — a causa raiz real do EBUSY não é o `rmSync` deste arquivo: a
 * própria `embedded-postgres`, com `persistent: false`, já chama
 * `fs.rm(databaseDir, ...)` DENTRO de `pg.stop()` logo depois do
 * `taskkill /f /t` no Windows — e propaga o erro se o SO ainda não soltou os
 * handles (confirmado lendo `embedded-postgres/dist/index.js`, método
 * `stop()`). Sem isto, o `await pg.stop()` abaixo lança EBUSY como exceção
 * não tratada no topo do módulo e derruba o processo com exit != 0, mesmo
 * com a suíte inteira já verde. `removeDataDirWithRetry` continua depois
 * como rede de segurança adicional, caso o `fs.rm` interno tenha falhado
 * parcialmente.
 */
async function stopEmbeddedPostgres(instance, attempts = 5, delayMs = 300) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await instance.stop();
      return;
    } catch (error) {
      const busy = error?.code === 'EBUSY' || error?.code === 'ENOTEMPTY';
      if (!busy || attempt === attempts) {
        if (busy) {
          console.warn(
            `Aviso: pg.stop() não conseguiu limpar o diretório de dados (${error.code}). ` +
              'Os testes já rodaram e reportaram seu resultado — continuando.',
          );
          return;
        }
        throw error;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

const dataDir = resolve(import.meta.dirname, '../.pgdata-e2e');
removeDataDirWithRetry(dataDir);

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

await stopEmbeddedPostgres(pg);
removeDataDirWithRetry(dataDir);
process.exit(result.status ?? 1);
