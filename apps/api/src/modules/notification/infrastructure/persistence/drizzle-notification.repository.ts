import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { NotificationDraft } from '../../domain/notification-rules';
import { NotificationRow, notifications } from './notifications.schema';

@Injectable()
export class NotificationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Criação em lote — um evento pode avisar as duas partes (ex.: disputa). */
  async createMany(drafts: NotificationDraft[], executor?: DatabaseExecutor): Promise<void> {
    if (drafts.length === 0) {
      return;
    }
    const target = executor ?? this.db;
    await target.insert(notifications).values(
      drafts.map((draft) => ({
        id: uuidv7(),
        identityId: draft.identityId,
        type: draft.type,
        title: draft.title,
        body: draft.body,
        resourceType: draft.resourceType,
        resourceId: draft.resourceId,
        createdAt: new Date(),
      })),
    );
  }

  async list(
    identityId: string,
    onlyUnread: boolean,
    page: number,
    pageSize: number,
  ): Promise<{ items: NotificationRow[]; totalItems: number }> {
    const where = onlyUnread
      ? and(eq(notifications.identityId, identityId), isNull(notifications.readAt))
      : eq(notifications.identityId, identityId);

    const [items, [total]] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(where),
    ]);
    return { items, totalItems: total?.count ?? 0 };
  }

  async countUnread(identityId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.identityId, identityId), isNull(notifications.readAt)));
    return row?.count ?? 0;
  }

  /** Marca uma notificação como lida; devolve false se não é do usuário. */
  async markAsRead(id: string, identityId: string, readAt: Date): Promise<boolean> {
    const updated = await this.db
      .update(notifications)
      .set({ readAt })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.identityId, identityId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    return updated.length > 0;
  }

  async markAllAsRead(identityId: string, readAt: Date): Promise<number> {
    const updated = await this.db
      .update(notifications)
      .set({ readAt })
      .where(and(eq(notifications.identityId, identityId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return updated.length;
  }
}
