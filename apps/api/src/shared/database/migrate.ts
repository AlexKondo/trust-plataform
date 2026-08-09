/**
 * Executa as migrations do drizzle (`pnpm db:migrate`).
 * Usa DIRECT_DATABASE_URL quando disponível (recomendado para DDL no Supabase).
 */
import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import postgres from 'postgres';

loadEnv({ path: resolve(__dirname, '../../../../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DIRECT_DATABASE_URL ou DATABASE_URL precisa estar definida');
  }

  const client = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(__dirname, '../../../drizzle'),
      migrationsTable: 'drizzle_migrations',
    });
    console.log('Migrations aplicadas com sucesso.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('Falha ao aplicar migrations:', error);
  process.exitCode = 1;
});
