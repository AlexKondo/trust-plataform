import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { EntityNotFoundException } from '../../../../shared/domain/exceptions/domain.exception';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { NotificationRepository } from '../persistence/drizzle-notification.repository';

class NotificationNotFoundException extends EntityNotFoundException {
  readonly code = 'NOTIFICATION_NOT_FOUND';

  constructor() {
    super('Notification not found.');
  }
}

const idSchema = z.string().uuid();
const pageSchema = z.coerce.number().int().min(1).optional();
/**
 * Querystring chega como texto e o ZodValidationPipe exige entrada e saída do
 * mesmo tipo — a conversão para booleano acontece no handler.
 */
const onlyUnreadSchema = z.enum(['true', 'false']).optional();

/** NTF-001 — avisos in-app do usuário autenticado. */
@Controller('notifications')
export class NotificationController {
  constructor(private readonly repository: NotificationRepository) {}

  @Get()
  async list(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('onlyUnread', new ZodValidationPipe(onlyUnreadSchema)) onlyUnread?: 'true' | 'false',
    @Query('page', new ZodValidationPipe(pageSchema)) page = 1,
    @Query('size', new ZodValidationPipe(pageSchema)) size = 20,
  ) {
    const pageSize = Math.min(size, 50);
    const { items, totalItems } = await this.repository.list(
      identity.identityId,
      onlyUnread === 'true',
      page,
      pageSize,
    );
    return PaginatedResult.of(
      items.map((row) => ({
        notificationId: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        read: row.readAt !== null,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      pageSize,
      totalItems,
    );
  }

  /** Contador do sininho — chamado com frequência, por isso é rota própria. */
  @Get('unread-count')
  async unreadCount(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return { unread: await this.repository.countUnread(identity.identityId) };
  }

  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('notificationId', new ZodValidationPipe(idSchema)) notificationId: string,
  ) {
    const updated = await this.repository.markAsRead(
      notificationId,
      identity.identityId,
      new Date(),
    );
    if (!updated) {
      // Já lida ou de outro usuário — não revelamos qual dos dois.
      throw new NotificationNotFoundException();
    }
    return { read: true };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return { updated: await this.repository.markAllAsRead(identity.identityId, new Date()) };
  }
}
