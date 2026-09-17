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
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminGuard } from '../../../../identity/infrastructure/security/admin.guard';
import { RequestContext } from '../../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../../shared/security/current-identity.decorator';
import { ZodValidationPipe } from '../../../../../shared/api/zod-validation.pipe';
import { WEBHOOK_ALLOWED_EVENT_TYPES } from '../../domain/webhook-event-allowlist';
import { WebhookSubscriptionService } from '../../application/webhook-subscription.service';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const idSchema = z.string().uuid('id must be a valid UUID');

const eventTypeEnum = z.enum(WEBHOOK_ALLOWED_EVENT_TYPES);

const createSchema = z.object({
  url: z.string().url(),
  description: z.string().trim().max(200).optional(),
  eventTypes: z.array(eventTypeEnum).min(1),
});

const updateSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().trim().max(200).optional(),
  eventTypes: z.array(eventTypeEnum).min(1).optional(),
});

const listQuerySchema = z.object({
  onlyActive: z.enum(['true', 'false']).optional(),
});

const deliveriesQuerySchema = z.object({
  subscriptionId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'SUCCESS', 'DEAD_LETTER']).optional(),
});

/**
 * IP-023 — CRUD administrativo de webhooks OUTBOUND (§"Admin CRUD + visibility").
 * API-only, sem frontend — gap disclosed no Completion Report, mesmo
 * precedente do `LedgerAdminController` (IP-010, "ledger admin is API-only").
 */
@Controller('admin/webhooks')
@UseGuards(AdminGuard)
export class AdminWebhookController {
  constructor(private readonly service: WebhookSubscriptionService) {}

  @Get('event-catalog')
  eventCatalog() {
    return { allowedEventTypes: WEBHOOK_ALLOWED_EVENT_TYPES };
  }

  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
    @Req() request: RequestWithContext,
  ) {
    return this.service.create(identity.identityId, body, {
      ipAddress: request.ip,
      correlationId: request.requestContext?.correlationId,
    });
  }

  @Get('subscriptions')
  async list(@Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>) {
    return this.service.list(query.onlyActive !== 'false');
  }

  @Get('subscriptions/:id')
  async get(@Param('id', new ZodValidationPipe(idSchema)) id: string) {
    return this.service.get(id);
  }

  @Patch('subscriptions/:id')
  async update(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
    @Req() request: RequestWithContext,
  ) {
    return this.service.update(id, identity.identityId, body, {
      ipAddress: request.ip,
      correlationId: request.requestContext?.correlationId,
    });
  }

  @Post('subscriptions/:id/disable')
  @HttpCode(HttpStatus.OK)
  async disable(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() request: RequestWithContext,
  ) {
    return this.service.setActive(id, false, identity.identityId, {
      ipAddress: request.ip,
      correlationId: request.requestContext?.correlationId,
    });
  }

  @Post('subscriptions/:id/enable')
  @HttpCode(HttpStatus.OK)
  async enable(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() request: RequestWithContext,
  ) {
    return this.service.setActive(id, true, identity.identityId, {
      ipAddress: request.ip,
      correlationId: request.requestContext?.correlationId,
    });
  }

  @Post('subscriptions/:id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  async rotateSecret(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() request: RequestWithContext,
  ) {
    return this.service.rotateSecret(id, identity.identityId, {
      ipAddress: request.ip,
      correlationId: request.requestContext?.correlationId,
    });
  }

  @Post('subscriptions/:id/confirm-rotation')
  @HttpCode(HttpStatus.OK)
  async confirmRotation(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() request: RequestWithContext,
  ) {
    return this.service.confirmRotation(id, identity.identityId, {
      ipAddress: request.ip,
      correlationId: request.requestContext?.correlationId,
    });
  }

  @Get('subscriptions/:id/health')
  async health(@Param('id', new ZodValidationPipe(idSchema)) id: string) {
    return this.service.deliveryHealth(id);
  }

  @Get('deliveries')
  async deliveries(
    @Query(new ZodValidationPipe(deliveriesQuerySchema)) query: z.infer<typeof deliveriesQuerySchema>,
  ) {
    return this.service.listDeliveries(query);
  }
}
