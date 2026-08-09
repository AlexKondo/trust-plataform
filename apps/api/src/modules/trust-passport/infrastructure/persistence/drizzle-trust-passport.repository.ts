import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { TrustPassport, TrustPassportStatus } from '../../domain/entities/trust-passport';
import { TrustPassportRepository } from '../../domain/repositories/trust-passport.repository';
import { TrustPassportRow, trustPassports } from './trust-passports.schema';

@Injectable()
export class DrizzleTrustPassportRepository extends TrustPassportRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(passport: TrustPassport, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target
      .insert(trustPassports)
      .values({
        id: passport.id,
        identityId: passport.identityId,
        status: passport.status,
        profileCompletion: passport.profileCompletion.toFixed(2),
        emailVerified: passport.emailVerified,
        phoneVerified: passport.phoneVerified,
        documentVerified: passport.documentVerified,
        addressVerified: passport.addressVerified,
        phone: passport.profile.phone,
        addressCountry: passport.profile.addressCountry,
        addressState: passport.profile.addressState,
        addressCity: passport.profile.addressCity,
        createdAt: passport.createdAt,
        updatedAt: passport.updatedAt,
        deletedAt: passport.deletedAt,
      })
      .onConflictDoUpdate({
        target: trustPassports.id,
        set: {
          status: passport.status,
          profileCompletion: passport.profileCompletion.toFixed(2),
          emailVerified: passport.emailVerified,
          phoneVerified: passport.phoneVerified,
          documentVerified: passport.documentVerified,
          addressVerified: passport.addressVerified,
          phone: passport.profile.phone,
          addressCountry: passport.profile.addressCountry,
          addressState: passport.profile.addressState,
          addressCity: passport.profile.addressCity,
          updatedAt: passport.updatedAt,
          deletedAt: passport.deletedAt,
        },
      });
  }

  async findById(id: string): Promise<TrustPassport | null> {
    const [row] = await this.db
      .select()
      .from(trustPassports)
      .where(and(eq(trustPassports.id, id), isNull(trustPassports.deletedAt)))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByIdentityId(identityId: string): Promise<TrustPassport | null> {
    const [row] = await this.db
      .select()
      .from(trustPassports)
      .where(and(eq(trustPassports.identityId, identityId), isNull(trustPassports.deletedAt)))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async existsByIdentityId(identityId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: trustPassports.id })
      .from(trustPassports)
      .where(eq(trustPassports.identityId, identityId))
      .limit(1);
    return Boolean(row);
  }

  private toEntity(row: TrustPassportRow): TrustPassport {
    return TrustPassport.restore({
      id: row.id,
      identityId: row.identityId,
      status: row.status as TrustPassportStatus,
      profileCompletion: Number(row.profileCompletion),
      emailVerified: row.emailVerified,
      phoneVerified: row.phoneVerified,
      documentVerified: row.documentVerified,
      addressVerified: row.addressVerified,
      profile: {
        phone: row.phone,
        addressCountry: row.addressCountry,
        addressState: row.addressState,
        addressCity: row.addressCity,
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    });
  }
}
