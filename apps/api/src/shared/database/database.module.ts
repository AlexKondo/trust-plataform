import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { AppConfigService } from '../config/app-config.service';
import * as schema from './schema';

export const SQL_CLIENT = Symbol('SQL_CLIENT');
export const DRIZZLE = Symbol('DRIZZLE');

export type Database = PostgresJsDatabase<typeof schema>;
/** Tipo aceito por serviços que participam de transação do chamador. */
export type DatabaseExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(SQL_CLIENT) private readonly client: postgres.Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: SQL_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        postgres(config.databaseUrl, {
          // Supabase session pooler: sem prepared statements para evitar conflitos de pool
          prepare: false,
          max: 10,
          idle_timeout: 30,
          connect_timeout: 10,
        }),
    },
    {
      provide: DRIZZLE,
      inject: [SQL_CLIENT],
      useFactory: (client: postgres.Sql): Database => drizzle(client, { schema }),
    },
    DatabaseShutdown,
  ],
  exports: [SQL_CLIENT, DRIZZLE],
})
export class DatabaseModule {}
