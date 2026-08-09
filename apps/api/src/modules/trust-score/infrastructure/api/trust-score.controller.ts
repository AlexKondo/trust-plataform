import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { EntityNotFoundException } from '../../../../shared/domain/exceptions/domain.exception';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import { TrustScoreRepository } from '../persistence/drizzle-trust-score.repository';

class TrustScoreNotFoundException extends EntityNotFoundException {
  readonly code = 'TRUST_SCORE_NOT_FOUND';

  constructor() {
    super('Trust Score not found. Verify your email to activate your passport first.');
  }
}

const paginationSchema = z.coerce.number().int().min(1).optional();

const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in']),
  value: z.unknown(),
});

const createScoreRuleSchema = z.object({
  eventName: z.string().regex(/^[A-Z][a-z][A-Za-z]*\.[A-Z][a-z][A-Za-z]*$/),
  description: z.string().min(3).max(300),
  points: z.number().int().min(-1000).max(1000),
  conditions: z.array(conditionSchema).default([]),
  maxOccurrences: z.number().int().min(1).nullable().default(null),
  active: z.boolean().default(true),
});

const updateScoreRuleSchema = z.object({
  description: z.string().min(3).max(300).optional(),
  points: z.number().int().min(-1000).max(1000).optional(),
  conditions: z.array(conditionSchema).optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
  active: z.boolean().optional(),
});

const updateLevelRuleSchema = z.object({
  minScore: z.number().int().min(0).max(1000).optional(),
  maxScore: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});

const idSchema = z.string().uuid();

@Controller()
export class TrustScoreController {
  constructor(private readonly repository: TrustScoreRepository) {}

  /** TRS-005 — meu score/nível consolidado. */
  @Get('trust-scores/me')
  async getMyScore(@CurrentIdentity() identity: AuthenticatedIdentity) {
    const score = await this.repository.findScoreByIdentityId(identity.identityId);
    if (!score) {
      throw new TrustScoreNotFoundException();
    }
    return {
      trustPassportId: score.trustPassportId,
      score: score.score,
      level: score.level,
      calculatedAt: score.calculatedAt.toISOString(),
    };
  }

  /** TRS-006 — minha timeline de trust events (explicabilidade). */
  @Get('trust-scores/me/timeline')
  async getMyTimeline(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('page', new ZodValidationPipe(paginationSchema)) page = 1,
    @Query('pageSize', new ZodValidationPipe(paginationSchema)) pageSize = 20,
  ) {
    const score = await this.repository.findScoreByIdentityId(identity.identityId);
    if (!score) {
      throw new TrustScoreNotFoundException();
    }
    const size = Math.min(pageSize, 100);
    const { items, totalItems } = await this.repository.listTimeline(
      score.trustPassportId,
      page,
      size,
    );
    return PaginatedResult.of(
      items.map((event) => ({
        id: event.id,
        eventName: event.eventName,
        points: event.points,
        occurredAt: event.occurredAt.toISOString(),
      })),
      page,
      size,
      totalItems,
    );
  }

  /** TRS-009 — admin: listar/criar/editar regras de pontuação. */
  @Get('admin/trust-score-rules')
  @UseGuards(AdminGuard)
  async listScoreRules() {
    return this.repository.listAllScoreRules();
  }

  @Post('admin/trust-score-rules')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async createScoreRule(
    @Body(new ZodValidationPipe(createScoreRuleSchema))
    body: z.infer<typeof createScoreRuleSchema>,
  ) {
    const now = new Date();
    const rule = {
      id: uuidv7(),
      eventName: body.eventName,
      description: body.description,
      points: body.points,
      conditions: body.conditions,
      maxOccurrences: body.maxOccurrences,
      active: body.active,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.upsertScoreRule(rule);
    return rule;
  }

  @Patch('admin/trust-score-rules/:id')
  @UseGuards(AdminGuard)
  async updateScoreRule(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateScoreRuleSchema))
    body: z.infer<typeof updateScoreRuleSchema>,
  ) {
    const existing = await this.repository.findScoreRule(id);
    if (!existing) {
      throw new TrustScoreNotFoundException();
    }
    const updated = {
      ...existing,
      ...body,
      conditions: body.conditions ?? (existing.conditions as never),
      updatedAt: new Date(),
    };
    await this.repository.upsertScoreRule(updated);
    return updated;
  }

  /** TRS-008 — admin: listar/editar faixas de nível. */
  @Get('admin/trust-level-rules')
  @UseGuards(AdminGuard)
  async listLevelRules() {
    return this.repository.listAllLevelRules();
  }

  @Patch('admin/trust-level-rules/:id')
  @UseGuards(AdminGuard)
  async updateLevelRule(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateLevelRuleSchema))
    body: z.infer<typeof updateLevelRuleSchema>,
  ) {
    await this.repository.updateLevelRule(id, body);
    return { id, ...body };
  }
}
