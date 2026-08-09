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
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import {
  CloseConversationRequest,
  RequestMeta,
  SendMessageRequest,
  closeConversationRequestSchema,
  paginationQuerySchema,
  sendMessageRequestSchema,
} from '../../application/dto/marketplace.dtos';
import { CloseConversationUseCase } from '../../application/usecases/close-conversation.usecase';
import { ConversationMessagingUseCase } from '../../application/usecases/conversation-messaging.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const conversationIdSchema = z.string().uuid('conversationId must be a valid UUID');

@Controller('marketplace/conversations')
export class MarketplaceConversationController {
  constructor(
    private readonly messagingUseCase: ConversationMessagingUseCase,
    private readonly closeUseCase: CloseConversationUseCase,
  ) {}

  /** MRK-007 — minhas conversas (como comprador ou vendedor). */
  @Get()
  async list(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('page', new ZodValidationPipe(paginationQuerySchema)) page = 1,
    @Query('size', new ZodValidationPipe(paginationQuerySchema)) size = 20,
  ) {
    return this.messagingUseCase.list(identity.identityId, page, Math.min(size, 50));
  }

  /** MRK-007 — conversa + histórico de mensagens. */
  @Get(':conversationId')
  async get(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('conversationId', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @Query('page', new ZodValidationPipe(paginationQuerySchema)) page = 1,
    @Query('size', new ZodValidationPipe(paginationQuerySchema)) size = 50,
  ) {
    return this.messagingUseCase.get(
      identity.identityId,
      conversationId,
      page,
      Math.min(size, 100),
    );
  }

  /** MRK-007 — envia mensagem (só participante, só conversa OPEN). */
  @Post(':conversationId/messages')
  @HttpCode(HttpStatus.CREATED)
  async send(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('conversationId', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @Body(new ZodValidationPipe(sendMessageRequestSchema)) body: SendMessageRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.messagingUseCase.send(identity.identityId, conversationId, body, this.meta(request));
  }

  /** MRK-007 — marca como lidas as mensagens recebidas. */
  @Patch(':conversationId/read')
  async markAsRead(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('conversationId', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @Req() request: RequestWithContext,
  ) {
    return this.messagingUseCase.markAsRead(identity.identityId, conversationId, this.meta(request));
  }

  /** MRK-008 — encerra a conversa. */
  @Post(':conversationId/close')
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('conversationId', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @Body(new ZodValidationPipe(closeConversationRequestSchema)) body: CloseConversationRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.closeUseCase.execute(identity.identityId, conversationId, body, this.meta(request));
  }

  private meta(request: RequestWithContext): RequestMeta {
    return {
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }
}
