import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../shared/database/database.module';
import { Public } from '../../shared/security/public.decorator';

interface HealthResponse {
  status: 'UP' | 'DEGRADED';
  database: 'UP' | 'DOWN';
  timestamp: string;
}

@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const database = await this.checkDatabase();
    return {
      status: database === 'UP' ? 'UP' : 'DEGRADED',
      database,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<'UP' | 'DOWN'> {
    try {
      await Promise.race([
        this.db.execute(sql`select 1`),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Database health check timed out')), 2000),
        ),
      ]);
      return 'UP';
    } catch {
      return 'DOWN';
    }
  }
}
