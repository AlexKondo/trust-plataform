import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminGuard } from '../../modules/identity/infrastructure/security/admin.guard';
import { RequestContext } from '../logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../security/authenticated-identity';
import { CurrentIdentity } from '../security/current-identity.decorator';
import { ZodValidationPipe } from '../api/zod-validation.pipe';
import { RiskFlagService } from './risk-flag.service';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const riskFlagIdSchema = z.string().uuid('riskFlagId must be a valid UUID');
const statusSchema = z.enum(['OPEN', 'DISMISSED', 'CONFIRMED']).optional();
const reviewSchema = z.object({
  decision: z.enum(['CONFIRMED', 'DISMISSED']),
  note: z.string().trim().min(1).max(2000).optional(),
});

/**
 * IP-014 — fila de revisão do admin (§6: "manual review path exists"). Só
 * ADMIN acessa (mesmo padrão de `VerificationController`). Nenhum endpoint
 * aqui bloqueia ou pune automaticamente uma entidade — a decisão de qualquer
 * ação punitiva (suspender, cancelar, etc.) continua no domínio dono da
 * entidade sinalizada; este controller só fecha o ciclo OPEN → decisão humana.
 */
@Controller('admin/risk-flags')
@UseGuards(AdminGuard)
export class RiskFlagController {
  constructor(private readonly riskFlagService: RiskFlagService) {}

  @Get()
  async queue(@Query('status', new ZodValidationPipe(statusSchema)) status?: string) {
    return this.riskFlagService.listQueue((status as 'OPEN' | 'DISMISSED' | 'CONFIRMED') ?? 'OPEN');
  }

  @Post(':riskFlagId/review')
  @HttpCode(HttpStatus.OK)
  async review(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('riskFlagId', new ZodValidationPipe(riskFlagIdSchema)) riskFlagId: string,
    @Body(new ZodValidationPipe(reviewSchema)) body: z.infer<typeof reviewSchema>,
    @Req() request: RequestWithContext,
  ) {
    return this.riskFlagService.review(riskFlagId, identity.identityId, body.decision, body.note, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
    });
  }
}
