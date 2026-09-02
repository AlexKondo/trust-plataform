import { Inject, Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { CommercialPolicy } from '../../domain/entities/commercial-policy';
import { CommercialPolicyRepository } from '../../domain/repositories/commercial-policy.repository';
import { CommercialPolicyRow, commercialPolicies } from './commercial-policy.schema';

@Injectable()
export class DrizzleCommercialPolicyRepository extends CommercialPolicyRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async findActive(executor?: DatabaseExecutor): Promise<CommercialPolicy | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(commercialPolicies)
      .orderBy(desc(commercialPolicies.createdAt))
      .limit(1);
    return row ? toCommercialPolicy(row) : null;
  }
}

function toCommercialPolicy(row: CommercialPolicyRow): CommercialPolicy {
  return CommercialPolicy.restore({
    id: row.id,
    trustFeeRateBps: row.trustFeeRateBps,
    defaultBillingIncrementMinutes: row.defaultBillingIncrementMinutes,
    createdAt: row.createdAt,
  });
}
