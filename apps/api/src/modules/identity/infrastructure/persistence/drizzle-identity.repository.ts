import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import postgres from 'postgres';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { Identity } from '../../domain/entities/identity';
import { IdentityStatus } from '../../domain/entities/identity-status';
import { EmailAlreadyExistsException } from '../../domain/exceptions/email-already-exists.exception';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { IdentityRow, identities } from './identities.schema';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class DrizzleIdentityRepository extends IdentityRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(identity: Identity, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    try {
      await target
        .insert(identities)
        .values({
          id: identity.id,
          fullName: identity.fullName,
          email: identity.email,
          passwordHash: identity.passwordHash,
          status: identity.status,
          termsAcceptedAt: identity.termsAcceptedAt,
          lastLoginAt: identity.lastLoginAt,
          failedLoginAttempts: identity.failedLoginAttempts,
          lockedUntil: identity.lockedUntil,
          isAdmin: identity.isAdmin,
          createdAt: identity.createdAt,
          updatedAt: identity.updatedAt,
          deletedAt: identity.deletedAt,
        })
        .onConflictDoUpdate({
          target: identities.id,
          set: {
            fullName: identity.fullName,
            passwordHash: identity.passwordHash,
            status: identity.status,
            lastLoginAt: identity.lastLoginAt,
            failedLoginAttempts: identity.failedLoginAttempts,
            lockedUntil: identity.lockedUntil,
            isAdmin: identity.isAdmin,
            updatedAt: new Date(),
            deletedAt: identity.deletedAt,
          },
        });
    } catch (error) {
      // Corrida entre existsByEmail e insert: o UNIQUE do banco é a garantia final (BR-001)
      if (this.isUniqueEmailViolation(error)) {
        throw new EmailAlreadyExistsException();
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Identity | null> {
    const [row] = await this.db
      .select()
      .from(identities)
      .where(and(eq(identities.id, id), isNull(identities.deletedAt)))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByEmail(email: string): Promise<Identity | null> {
    const [row] = await this.db
      .select()
      .from(identities)
      .where(and(eq(identities.email, email.toLowerCase()), isNull(identities.deletedAt)))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: identities.id })
      .from(identities)
      .where(eq(identities.email, email.toLowerCase()))
      .limit(1);
    return Boolean(row);
  }

  private toEntity(row: IdentityRow): Identity {
    return Identity.restore({
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      passwordHash: row.passwordHash,
      status: row.status as IdentityStatus,
      termsAcceptedAt: row.termsAcceptedAt,
      lastLoginAt: row.lastLoginAt,
      failedLoginAttempts: row.failedLoginAttempts,
      lockedUntil: row.lockedUntil,
      isAdmin: row.isAdmin,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    });
  }

  private isUniqueEmailViolation(error: unknown): boolean {
    if (error instanceof postgres.PostgresError) {
      return error.code === UNIQUE_VIOLATION && error.constraint_name === 'idx_identity_email';
    }
    if (error instanceof Error && error.cause instanceof postgres.PostgresError) {
      return (
        error.cause.code === UNIQUE_VIOLATION &&
        error.cause.constraint_name === 'idx_identity_email'
      );
    }
    return false;
  }
}
