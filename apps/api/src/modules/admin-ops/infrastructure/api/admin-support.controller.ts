import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { SupportLookupService } from '../../application/support-lookup.service';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const querySchema = z.object({
  email: z.string().email().optional(),
  orderId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional(),
});

/**
 * IP-018 — "support pode rastrear um pedido/pagamento de ponta a ponta"
 * (acceptance criteria). Um identificador por chamada; nenhum lookup livre
 * de tabela (fora de escopo §4: "no unrestricted database admin UI").
 */
@Controller('admin/support/lookup')
@UseGuards(AdminGuard)
export class AdminSupportController {
  constructor(private readonly lookup: SupportLookupService) {}

  @Get()
  async find(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(querySchema)) query: z.infer<typeof querySchema>,
    @Req() request: RequestWithContext,
  ) {
    const meta = {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
    };
    const provided = [query.email, query.orderId, query.paymentId].filter(Boolean);
    if (provided.length !== 1) {
      throw new BadRequestException({
        code: 'EXACTLY_ONE_IDENTIFIER_REQUIRED',
        message: 'Provide exactly one of email, orderId or paymentId.',
      });
    }
    if (query.email) {
      return this.lookup.lookupByEmail(identity.identityId, query.email, meta);
    }
    if (query.orderId) {
      return this.lookup.lookupByOrderId(identity.identityId, query.orderId, meta);
    }
    return this.lookup.lookupByPaymentId(identity.identityId, query.paymentId!, meta);
  }
}
