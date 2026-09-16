import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { PartnerAvailabilityWindow } from '../../domain/entities/partner-availability';
import { Weekday } from '../../domain/entities/marketplace-types';
import { PartnerAvailabilityRepository } from '../../domain/repositories/partner-availability.repository';
import {
  PartnerAvailabilityWindowRow,
  marketplacePartnerAvailabilityWindows,
} from './partner-availability.schema';

@Injectable()
export class DrizzlePartnerAvailabilityRepository extends PartnerAvailabilityRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async replaceForPartner(
    partnerId: string,
    windows: PartnerAvailabilityWindow[],
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const run = async (tx: DatabaseExecutor) => {
      await tx
        .delete(marketplacePartnerAvailabilityWindows)
        .where(eq(marketplacePartnerAvailabilityWindows.partnerId, partnerId));
      if (windows.length > 0) {
        await tx.insert(marketplacePartnerAvailabilityWindows).values(windows.map((w) => w.toProps()));
      }
    };
    if (executor) {
      await run(executor);
      return;
    }
    await this.db.transaction((tx) => run(tx));
  }

  async listByPartner(partnerId: string): Promise<PartnerAvailabilityWindow[]> {
    const rows = await this.db
      .select()
      .from(marketplacePartnerAvailabilityWindows)
      .where(eq(marketplacePartnerAvailabilityWindows.partnerId, partnerId));
    return rows.map(toAvailabilityWindow);
  }
}

function toAvailabilityWindow(row: PartnerAvailabilityWindowRow): PartnerAvailabilityWindow {
  return PartnerAvailabilityWindow.restore({
    id: row.id,
    partnerId: row.partnerId,
    dayOfWeek: row.dayOfWeek as Weekday,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    timezone: row.timezone,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
