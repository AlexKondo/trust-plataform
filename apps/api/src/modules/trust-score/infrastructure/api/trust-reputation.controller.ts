import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import {
  DomainException,
  EntityNotFoundException,
} from '../../../../shared/domain/exceptions/domain.exception';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { Public } from '../../../../shared/security/public.decorator';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import { TrustPassportRepository } from '../../../trust-passport/domain/repositories/trust-passport.repository';
import { TrustPassportNotFoundException } from '../../../trust-passport/domain/exceptions/trust-passport.exceptions';
import {
  TrustProfileService,
} from '../../application/usecases/trust-profile.service';
import { ShareTokenService } from '../../domain/services/share-token.service';
import { TrustReputationRepository } from '../persistence/drizzle-trust-reputation.repository';

class ShareNotFoundException extends EntityNotFoundException {
  readonly code = 'SHARE_NOT_FOUND';

  constructor() {
    super('Shared profile link not found.');
  }
}

/** Link revogado/expirado → 410 GONE (padrão trust-api para shares). */
class ShareGoneException extends DomainException {
  readonly code = 'SHARE_LINK_GONE';
  override readonly httpStatus = 410;

  constructor() {
    super('This shared profile link has expired or been revoked.');
  }
}

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in']),
  value: z.unknown(),
});

const badgeSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,59}$/),
  name: z.string().min(3).max(120),
  description: z.string().min(3).max(500),
  badgeType: z.enum(['PERMANENT', 'DYNAMIC']),
  criteria: z.array(conditionSchema).default([]),
  active: z.boolean().default(true),
});

const visibilitySchema = z.object({
  showScore: z.boolean(),
  showLevel: z.boolean(),
  showBadges: z.boolean(),
  showVerifications: z.boolean(),
});

const createShareSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).default(30),
});

const idSchema = z.string().uuid();
const shareTokenSchema = z.string().min(20).max(120);
const paginationSchema = z.coerce.number().int().min(1).optional();

@Controller()
export class TrustReputationController {
  constructor(
    private readonly repository: TrustReputationRepository,
    private readonly passportRepository: TrustPassportRepository,
    private readonly profileService: TrustProfileService,
    private readonly shareTokenService: ShareTokenService,
    private readonly auditLogService: AuditLogService,
    private readonly config: AppConfigService,
  ) {}

  private async myPassportId(identityId: string): Promise<string> {
    const passport = await this.passportRepository.findByIdentityId(identityId);
    if (!passport) {
      throw new TrustPassportNotFoundException();
    }
    return passport.id;
  }

  // ── TRS-014 — meus badges ──────────────────────────────────────────────────
  @Get('trust-badges/me')
  async getMyBadges(@CurrentIdentity() identity: AuthenticatedIdentity) {
    const passportId = await this.myPassportId(identity.identityId);
    const badges = await this.repository.listAwardedWithCatalog(passportId);
    return badges.map((badge) => ({ ...badge, awardedAt: badge.awardedAt.toISOString() }));
  }

  // ── TRS-016 — visibilidade ─────────────────────────────────────────────────
  @Get('trust-profile/visibility')
  async getVisibility(@CurrentIdentity() identity: AuthenticatedIdentity) {
    const passportId = await this.myPassportId(identity.identityId);
    const policy = await this.profileService.getVisibility(passportId);
    const { showScore, showLevel, showBadges, showVerifications } = policy;
    return { showScore, showLevel, showBadges, showVerifications };
  }

  @Put('trust-profile/visibility')
  async updateVisibility(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(visibilitySchema)) body: z.infer<typeof visibilitySchema>,
  ) {
    const passportId = await this.myPassportId(identity.identityId);
    const current = await this.profileService.getVisibility(passportId);
    await this.repository.upsertVisibility({ ...current, ...body });
    return body;
  }

  // ── TRS-015 — perfil consolidado (visão privada do dono) ──────────────────
  @Get('trust-profile/me')
  async getMyProfile(@CurrentIdentity() identity: AuthenticatedIdentity) {
    const passportId = await this.myPassportId(identity.identityId);
    return this.profileService.buildByPassportId(passportId, 'PRIVATE_VIEW');
  }

  // ── TRS-017/019/020 — shares ───────────────────────────────────────────────
  @Post('trust-profile/shares')
  @HttpCode(HttpStatus.CREATED)
  async createShare(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(createShareSchema)) body: z.infer<typeof createShareSchema>,
    @Req() request: RequestWithContext,
  ) {
    const passportId = await this.myPassportId(identity.identityId);
    const { token, tokenHash } = this.shareTokenService.generate();
    const share = {
      id: uuidv7(),
      trustPassportId: passportId,
      tokenHash,
      expiresAt: new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000),
      revokedAt: null,
      createdAt: new Date(),
    };
    await this.repository.createShare(share);
    await this.auditLogService.recordSafe({
      identityId: identity.identityId,
      operation: 'ShareTrustProfile',
      resource: 'TrustProfileShare',
      resourceId: share.id,
      result: 'SUCCESS',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.requestContext?.correlationId,
    });
    return {
      shareId: share.id,
      shareUrl: `${this.config.appBaseUrl}/p/${token}`,
      expiresAt: share.expiresAt.toISOString(),
    };
  }

  @Get('trust-profile/shares')
  async listShares(@CurrentIdentity() identity: AuthenticatedIdentity) {
    const passportId = await this.myPassportId(identity.identityId);
    const shares = await this.repository.listShares(passportId);
    const now = Date.now();
    return shares.map((share) => ({
      shareId: share.id,
      status: share.revokedAt
        ? 'REVOKED'
        : share.expiresAt.getTime() < now
          ? 'EXPIRED'
          : 'ACTIVE',
      createdAt: share.createdAt.toISOString(),
      expiresAt: share.expiresAt.toISOString(),
    }));
  }

  /** TRS-019 — revogação (extensão do 017; ownership verificada). */
  @Delete('trust-profile/shares/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeShare(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() request: RequestWithContext,
  ): Promise<void> {
    const passportId = await this.myPassportId(identity.identityId);
    const share = await this.repository.findShareById(id);
    if (!share || share.trustPassportId !== passportId) {
      throw new ShareNotFoundException();
    }
    if (!share.revokedAt) {
      await this.repository.revokeShare(id, new Date());
      await this.auditLogService.recordSafe({
        identityId: identity.identityId,
        operation: 'RevokeTrustProfileShare',
        resource: 'TrustProfileShare',
        resourceId: id,
        result: 'SUCCESS',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        correlationId: request.requestContext?.correlationId,
      });
    }
  }

  /** TRS-020 — histórico de acessos de um link (dono). */
  @Get('trust-profile/shares/:id/access-history')
  async accessHistory(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Query('page', new ZodValidationPipe(paginationSchema)) page = 1,
    @Query('pageSize', new ZodValidationPipe(paginationSchema)) pageSize = 20,
  ) {
    const passportId = await this.myPassportId(identity.identityId);
    const share = await this.repository.findShareById(id);
    if (!share || share.trustPassportId !== passportId) {
      throw new ShareNotFoundException();
    }
    const size = Math.min(pageSize, 100);
    const { items, totalItems } = await this.repository.listAccessHistory(id, page, size);
    return PaginatedResult.of(
      items.map((log) => ({
        accessedAt: log.accessedAt.toISOString(),
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
      })),
      page,
      size,
      totalItems,
    );
  }

  // ── Público: perfil compartilhado + verificação de autenticidade ───────────
  /** TRS-015 (PUBLIC_VIEW) via link compartilhado; registra acesso (TRS-020). */
  @Public()
  @Get('public/trust-profile/:token')
  async getSharedProfile(
    @Param('token', new ZodValidationPipe(shareTokenSchema)) token: string,
    @Req() request: RequestWithContext,
  ) {
    const share = await this.resolveShare(token);
    await this.repository.logAccess({
      id: uuidv7(),
      shareId: share.id,
      trustPassportId: share.trustPassportId,
      accessedAt: new Date(),
      ipAddress: request.ip ?? null,
      userAgent: (request.headers['user-agent'] ?? '').slice(0, 500) || null,
    });
    return this.profileService.buildByPassportId(share.trustPassportId, 'PUBLIC_VIEW');
  }

  /** TRS-018 — verificação de autenticidade do link (HMAC + estado). */
  @Public()
  @Get('public/trust-profile/:token/verify')
  async verifySharedProfile(
    @Param('token', new ZodValidationPipe(shareTokenSchema)) token: string,
  ) {
    const verified = this.shareTokenService.verify(token);
    if (!verified) {
      return { authentic: false, reason: 'INVALID_SIGNATURE' };
    }
    const share = await this.repository.findShareByTokenHash(verified.tokenHash);
    if (!share) {
      return { authentic: false, reason: 'UNKNOWN_LINK' };
    }
    if (share.revokedAt) {
      return { authentic: false, reason: 'REVOKED' };
    }
    if (share.expiresAt.getTime() < Date.now()) {
      return { authentic: false, reason: 'EXPIRED' };
    }
    return { authentic: true, issuedAt: share.createdAt.toISOString(), expiresAt: share.expiresAt.toISOString() };
  }

  private async resolveShare(token: string) {
    const verified = this.shareTokenService.verify(token);
    if (!verified) {
      throw new ShareNotFoundException();
    }
    const share = await this.repository.findShareByTokenHash(verified.tokenHash);
    if (!share) {
      throw new ShareNotFoundException();
    }
    if (share.revokedAt || share.expiresAt.getTime() < Date.now()) {
      throw new ShareGoneException();
    }
    return share;
  }

  // ── TRS-012 — admin do catálogo de badges ─────────────────────────────────
  @Get('admin/trust-badges')
  @UseGuards(AdminGuard)
  async listBadgesAdmin() {
    return this.repository.listBadges(false);
  }

  @Post('admin/trust-badges')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async createBadge(@Body(new ZodValidationPipe(badgeSchema)) body: z.infer<typeof badgeSchema>) {
    const now = new Date();
    const badge = { id: uuidv7(), ...body, createdAt: now, updatedAt: now };
    await this.repository.upsertBadge(badge);
    return badge;
  }

  @Patch('admin/trust-badges/:id')
  @UseGuards(AdminGuard)
  async updateBadge(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(badgeSchema.partial()))
    body: Partial<z.infer<typeof badgeSchema>>,
  ) {
    const existing = await this.repository.findBadge(id);
    if (!existing) {
      throw new ShareNotFoundException();
    }
    const updated = {
      ...existing,
      ...body,
      criteria: body.criteria ?? (existing.criteria as never),
      updatedAt: new Date(),
    };
    await this.repository.upsertBadge(updated);
    return updated;
  }
}
