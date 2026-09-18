import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import { ConfigureCashbackCampaignUseCase, ConfigurePointsRuleUseCase } from '../../application/usecases/admin-config.usecases';

/**
 * IP-012 — ADMIN-only. Configura regras de pontos/campanhas de cashback.
 * Nenhuma regra/campanha existe até um admin criar uma explicitamente
 * (tabelas nascem vazias) — spec §4 "no hard-coded campaign forever" e
 * Conflict Escalations desta IP.
 */
const pointsRuleSchema = z.object({
  eventName: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  points: z.number().int().positive(),
  active: z.boolean().default(false),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

const cashbackCampaignSchema = z.object({
  name: z.string().min(1).max(120),
  percentageBps: z.number().int().positive().max(10_000),
  active: z.boolean().default(false),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

@Controller('admin/growth')
@UseGuards(AdminGuard)
export class GrowthAdminController {
  constructor(
    private readonly configurePointsRule: ConfigurePointsRuleUseCase,
    private readonly configureCashbackCampaign: ConfigureCashbackCampaignUseCase,
  ) {}

  @Post('points-rules')
  async createPointsRule(@Body(new ZodValidationPipe(pointsRuleSchema)) body: z.infer<typeof pointsRuleSchema>) {
    return this.configurePointsRule.execute(body);
  }

  @Post('cashback-campaigns')
  async createCashbackCampaign(
    @Body(new ZodValidationPipe(cashbackCampaignSchema)) body: z.infer<typeof cashbackCampaignSchema>,
  ) {
    return this.configureCashbackCampaign.execute(body);
  }
}
