import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { ServiceExecutionUseCase } from '../../application/usecases/service-execution.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const orderIdSchema = z.string().uuid('orderId must be a valid UUID');

/**
 * IP-018 — fecha o gap disclosed no Completion Report do IP-006: nenhuma rota
 * admin/mediador existia em `marketplace/**` para ler Trust Evidence (execution
 * evidence, service notes, change-order evidence) na resolução de disputa.
 * Rota SÓ de leitura, `AdminGuard`, auditada em `ServiceExecutionUseCase`.
 */
@Controller('admin/marketplace')
@UseGuards(AdminGuard)
export class AdminEvidenceController {
  constructor(private readonly serviceExecution: ServiceExecutionUseCase) {}

  @Get('orders/:orderId/evidence')
  async reviewEvidence(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Req() request: RequestWithContext,
  ) {
    return this.serviceExecution.listEvidenceForAdminReview(identity.identityId, orderId, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
    });
  }
}
