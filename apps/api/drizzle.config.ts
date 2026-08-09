import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '../../.env') });

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DIRECT_DATABASE_URL ou DATABASE_URL precisa estar definida (veja .env.example)');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/shared/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  migrations: {
    table: 'drizzle_migrations',
    schema: 'public',
  },
  strict: true,
  verbose: true,
});
