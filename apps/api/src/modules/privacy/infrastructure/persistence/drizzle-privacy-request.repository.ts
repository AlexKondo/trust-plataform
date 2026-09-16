import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import {
  DeletionRejectionReason,
  PrivacyRequest,
  PrivacyRequestResultSummary,
  PrivacyRequestStatus,
  PrivacyRequestType,
} from '../../domain/entities/privacy-request';
import { PrivacyRequestRepository } from '../../domain/repositories/privacy-request.repository';
import { PrivacyRequestRow, privacyRequests } from './privacy-requests.schema';

@Injectable()
export class DrizzlePrivacyRequestRepository extends PrivacyRequestRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(request: PrivacyRequest, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target
      .insert(privacyRequests)
      .values({
        id: request.id,
        identityId: request.identityId,
        type: request.type,
        status: request.status,
        requestedAt: request.requestedAt,
        processedAt: request.processedAt,
        completedAt: request.completedAt,
        rejectionReason: request.rejectionReason,
        resultSummary: request.resultSummary ?? undefined,
      })
      .onConflictDoUpdate({
        target: privacyRequests.id,
        set: {
          status: request.status,
          processedAt: request.processedAt,
          completedAt: request.completedAt,
          rejectionReason: request.rejectionReason,
          resultSummary: request.resultSummary ?? undefined,
          updatedAt: new Date(),
        },
      });
  }

  async findById(id: string): Promise<PrivacyRequest | null> {
    const [row] = await this.db.select().from(privacyRequests).where(eq(privacyRequests.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async listByIdentity(identityId: string): Promise<PrivacyRequest[]> {
    const rows = await this.db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.identityId, identityId))
      .orderBy(desc(privacyRequests.createdAt));
    return rows.map((row) => this.toEntity(row));
  }

  private toEntity(row: PrivacyRequestRow): PrivacyRequest {
    return PrivacyRequest.restore({
      id: row.id,
      identityId: row.identityId,
      type: row.type as PrivacyRequestType,
      status: row.status as PrivacyRequestStatus,
      requestedAt: row.requestedAt,
      processedAt: row.processedAt,
      completedAt: row.completedAt,
      rejectionReason: row.rejectionReason as DeletionRejectionReason | null,
      resultSummary: (row.resultSummary as PrivacyRequestResultSummary | null) ?? null,
    });
  }
}
