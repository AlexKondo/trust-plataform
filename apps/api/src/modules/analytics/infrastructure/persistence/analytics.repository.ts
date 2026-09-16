import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { Cents, fromReais } from '../../../../shared/money/money';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { marketplaceConversations, marketplaceMessages } from '../../../marketplace/infrastructure/persistence/marketplace.schema';
import { marketplaceOffers } from '../../../marketplace/infrastructure/persistence/marketplace-offer.schema';
import { marketplaceOrders } from '../../../marketplace/infrastructure/persistence/marketplace-order.schema';
import { marketplaceDisputes } from '../../../marketplace/infrastructure/persistence/marketplace-review.schema';
import { serviceRequests } from '../../../marketplace/infrastructure/persistence/service-request.schema';
import { paymentAuthorizations, trustCustodies } from '../../../payment/infrastructure/persistence/payment.schema';
import { trustPassports } from '../../../trust-passport/infrastructure/persistence/trust-passports.schema';
import { trustScores } from '../../../trust-score/infrastructure/persistence/trust-score.schema';

/**
 * IP-020 — camada de agregação READ-ONLY para analytics/inteligência
 * operacional (IP-020 spec §1/§4: "use operational projections/events
 * before building a warehouse"; "no enterprise data warehouse").
 *
 * Decisão de design deliberada: em vez de estender os repositórios de
 * domínio de Marketplace/Payment (que pertencem a outras IPs, cujo escopo de
 * negócio esta IP não deve tocar — 00_READ_FIRST §5.1), este repositório
 * importa diretamente as definições de TABELA (schema Drizzle) já exportadas
 * por aqueles módulos e roda suas PRÓPRIAS queries agregadas, usando a
 * própria conexão `DRIZZLE` (módulo global). Isso é permitido explicitamente
 * pelo mandato desta IP ("you may read their schemas/tables for aggregation
 * queries, but do not change their behavior") e resulta em ZERO alteração a
 * qualquer arquivo de `marketplace/**` ou `payment/**` — confirmado por
 * `git diff --stat` no Completion Report.
 *
 * Toda contagem/soma aqui é recalculada a cada chamada, direto da tabela
 * real — não existe um contador paralelo que possa divergir da fonte
 * (acceptance criteria "numbers reconcile with source transactions").
 * Cada método corresponde 1:1 a uma entrada de `../domain/metrics-definitions.ts`.
 */

export interface DateRange {
  from: Date;
  to: Date;
}

export interface FunnelCounts {
  requestsCreated: number;
  requestsMatched: number;
  offersCreated: number;
  ordersCreated: number;
  executionCompleted: number;
  customerConfirmed: number;
  paymentsReleased: number;
  grossOrderValueCents: Cents;
  releasedCustodyValueCents: Cents;
}

export interface TimingMetrics {
  avgTimeToFirstOfferMinutes: number | null;
  avgPartnerResponseMinutes: number | null;
}

export interface OutcomeCounts {
  ordersCreated: number;
  ordersCompleted: number;
  ordersCancelled: number;
  ordersDisputed: number;
}

export interface PaymentAuthorizationCounts {
  attempted: number;
  approved: number;
}

export interface TrustAdoptionSnapshot {
  activeIdentities: number;
  identitiesWithPassport: number;
  documentVerifiedPassports: number;
  totalPassports: number;
  levelDistribution: Array<{ level: string; count: number }>;
}

export interface CohortRow {
  cohortMonth: string;
  cohortSize: number;
  retainedMonth1: number;
  retainedMonth2: number;
}

@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getFunnelCounts(range: DateRange, executor?: DatabaseExecutor): Promise<FunnelCounts> {
    const target = executor ?? this.db;
    // Dentro de um fragmento `sql` bruto (ao contrário de `gte(coluna, valor)`,
    // que conhece o tipo da coluna e serializa sozinho), o Drizzle passa o
    // valor interpolado direto ao driver postgres.js como bind parameter —
    // sem o mapeamento de tipo por coluna. Um `Date` bruto nessa posição falha
    // no driver ("Received an instance of Date"); ISO string é o formato que
    // `timestamptz` aceita como parâmetro textual. Mesma causa/mesma correção
    // em `getTimingMetrics`/`getCohortRetention` (uso de `db.execute(sql...)`).
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();

    const [requestRow] = await target
      .select({
        created: sql<number>`count(*) filter (where ${serviceRequests.createdAt} >= ${fromIso} and ${serviceRequests.createdAt} < ${toIso})::int`,
        matched: sql<number>`count(*) filter (where ${serviceRequests.matchedAt} >= ${fromIso} and ${serviceRequests.matchedAt} < ${toIso})::int`,
      })
      .from(serviceRequests);

    const [offerRow] = await target
      .select({
        created: sql<number>`count(*) filter (where ${marketplaceOffers.createdAt} >= ${fromIso} and ${marketplaceOffers.createdAt} < ${toIso})::int`,
      })
      .from(marketplaceOffers);

    const [orderRow] = await target
      .select({
        created: sql<number>`count(*) filter (where ${marketplaceOrders.createdAt} >= ${fromIso} and ${marketplaceOrders.createdAt} < ${toIso})::int`,
        executionCompleted: sql<number>`count(*) filter (where ${marketplaceOrders.completedAt} >= ${fromIso} and ${marketplaceOrders.completedAt} < ${toIso})::int`,
        customerConfirmed: sql<number>`count(*) filter (where ${marketplaceOrders.customerConfirmedAt} >= ${fromIso} and ${marketplaceOrders.customerConfirmedAt} < ${toIso})::int`,
        grossValue: sql<string>`coalesce(sum(${marketplaceOrders.amount}) filter (where ${marketplaceOrders.createdAt} >= ${fromIso} and ${marketplaceOrders.createdAt} < ${toIso}), 0)`,
      })
      .from(marketplaceOrders);

    const [custodyRow] = await target
      .select({
        released: sql<number>`count(*) filter (where ${trustCustodies.releasedAt} >= ${fromIso} and ${trustCustodies.releasedAt} < ${toIso})::int`,
        releasedValue: sql<string>`coalesce(sum(${trustCustodies.amount}) filter (where ${trustCustodies.releasedAt} >= ${fromIso} and ${trustCustodies.releasedAt} < ${toIso}), 0)`,
      })
      .from(trustCustodies);

    return {
      requestsCreated: requestRow?.created ?? 0,
      requestsMatched: requestRow?.matched ?? 0,
      offersCreated: offerRow?.created ?? 0,
      ordersCreated: orderRow?.created ?? 0,
      executionCompleted: orderRow?.executionCompleted ?? 0,
      customerConfirmed: orderRow?.customerConfirmed ?? 0,
      paymentsReleased: custodyRow?.released ?? 0,
      grossOrderValueCents: fromReais(orderRow?.grossValue ?? '0'),
      releasedCustodyValueCents: fromReais(custodyRow?.releasedValue ?? '0'),
    };
  }

  async getOutcomeCounts(range: DateRange, executor?: DatabaseExecutor): Promise<OutcomeCounts> {
    const target = executor ?? this.db;

    const [orderRow] = await target
      .select({
        created: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${marketplaceOrders.status} in ('COMPLETED','CLOSED'))::int`,
        cancelled: sql<number>`count(*) filter (where ${marketplaceOrders.status} = 'CANCELLED')::int`,
      })
      .from(marketplaceOrders)
      .where(and(gte(marketplaceOrders.createdAt, range.from), lt(marketplaceOrders.createdAt, range.to)));

    const [disputeRow] = await target
      .select({
        disputedOrders: sql<number>`count(distinct ${marketplaceDisputes.orderId})::int`,
      })
      .from(marketplaceDisputes)
      .innerJoin(marketplaceOrders, eq(marketplaceDisputes.orderId, marketplaceOrders.id))
      .where(and(gte(marketplaceOrders.createdAt, range.from), lt(marketplaceOrders.createdAt, range.to)));

    return {
      ordersCreated: orderRow?.created ?? 0,
      ordersCompleted: orderRow?.completed ?? 0,
      ordersCancelled: orderRow?.cancelled ?? 0,
      ordersDisputed: disputeRow?.disputedOrders ?? 0,
    };
  }

  async getPaymentAuthorizationCounts(
    range: DateRange,
    executor?: DatabaseExecutor,
  ): Promise<PaymentAuthorizationCounts> {
    const target = executor ?? this.db;
    const [row] = await target
      .select({
        attempted: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where ${paymentAuthorizations.status} = 'APPROVED')::int`,
      })
      .from(paymentAuthorizations)
      .where(
        and(
          gte(paymentAuthorizations.createdAt, range.from),
          lt(paymentAuthorizations.createdAt, range.to),
        ),
      );
    return { attempted: row?.attempted ?? 0, approved: row?.approved ?? 0 };
  }

  /**
   * Tempo até a primeira proposta e tempo de resposta do Partner — via LATERAL
   * JOIN em SQL bruto (drizzle `sql` parametrizado, mesmo mecanismo usado por
   * `health.controller.ts`). A árvore de query builder do Drizzle não expressa
   * LATERAL diretamente; a alternativa (duas subqueries correlacionadas
   * separadas, uma por métrica) exigiria o MESMO SQL efetivo com o dobro das
   * viagens ao banco — preferiu-se uma query só, auditável linha a linha.
   */
  async getTimingMetrics(range: DateRange, executor?: DatabaseExecutor): Promise<TimingMetrics> {
    const target = executor ?? this.db;
    const result = await target.execute<{
      avg_time_to_first_offer_minutes: number | null;
      avg_partner_response_minutes: number | null;
    }>(sql`
      select
        avg(extract(epoch from (first_offer.created_at - c.started_at)) / 60.0) as avg_time_to_first_offer_minutes,
        avg(extract(epoch from (first_reply.sent_at - c.started_at)) / 60.0) as avg_partner_response_minutes
      from ${marketplaceConversations} c
      left join lateral (
        select min(o.created_at) as created_at
        from ${marketplaceOffers} o
        where o.conversation_id = c.id
      ) first_offer on true
      left join lateral (
        select min(m.sent_at) as sent_at
        from ${marketplaceMessages} m
        where m.conversation_id = c.id and m.sender_id = c.seller_id
      ) first_reply on true
      where c.started_at >= ${range.from.toISOString()} and c.started_at < ${range.to.toISOString()}
    `);
    const row = result[0] as
      | { avg_time_to_first_offer_minutes: number | string | null; avg_partner_response_minutes: number | string | null }
      | undefined;
    return {
      avgTimeToFirstOfferMinutes: toNullableNumber(row?.avg_time_to_first_offer_minutes),
      avgPartnerResponseMinutes: toNullableNumber(row?.avg_partner_response_minutes),
    };
  }

  async getTrustAdoption(executor?: DatabaseExecutor): Promise<TrustAdoptionSnapshot> {
    const target = executor ?? this.db;

    const [identityRow] = await target
      .select({ active: sql<number>`count(*)::int` })
      .from(identities)
      .where(isNull(identities.deletedAt));

    const [passportRow] = await target
      .select({
        total: sql<number>`count(*)::int`,
        documentVerified: sql<number>`count(*) filter (where ${trustPassports.documentVerified} = true)::int`,
      })
      .from(trustPassports)
      .where(isNull(trustPassports.deletedAt));

    const levelRows = await target
      .select({ level: trustScores.level, count: sql<number>`count(*)::int` })
      .from(trustScores)
      .innerJoin(identities, eq(trustScores.identityId, identities.id))
      .where(isNull(identities.deletedAt))
      .groupBy(trustScores.level);

    return {
      activeIdentities: identityRow?.active ?? 0,
      identitiesWithPassport: passportRow?.total ?? 0,
      documentVerifiedPassports: passportRow?.documentVerified ?? 0,
      totalPassports: passportRow?.total ?? 0,
      levelDistribution: levelRows.map((row) => ({ level: row.level, count: row.count })),
    };
  }

  /**
   * Retenção por coorte mensal de cadastro (Identity.created_at). SQL bruto:
   * a agregação por `date_trunc` com duas janelas de retenção correlacionadas
   * (mês+1 e mês+2 do cadastro de CADA coorte, não um intervalo fixo global)
   * não é natural no query builder do Drizzle sem repetir a mesma junção duas
   * vezes com CTEs — SQL direto é mais legível e mais fácil de conferir contra
   * a fórmula documentada em `metrics-definitions.ts`.
   */
  async getCohortRetention(sinceMonths: number, executor?: DatabaseExecutor): Promise<CohortRow[]> {
    const target = executor ?? this.db;
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - sinceMonths);
    cutoff.setUTCDate(1);
    cutoff.setUTCHours(0, 0, 0, 0);

    const result = await target.execute<{
      cohort_month: string;
      cohort_size: number;
      retained_month_1: number;
      retained_month_2: number;
    }>(sql`
      select
        to_char(date_trunc('month', i.created_at), 'YYYY-MM') as cohort_month,
        count(distinct i.id)::int as cohort_size,
        count(distinct o1.buyer_id)::int as retained_month_1,
        count(distinct o2.buyer_id)::int as retained_month_2
      from ${identities} i
      left join ${marketplaceOrders} o1
        on o1.buyer_id = i.id
        and o1.created_at >= date_trunc('month', i.created_at) + interval '1 month'
        and o1.created_at < date_trunc('month', i.created_at) + interval '2 month'
      left join ${marketplaceOrders} o2
        on o2.buyer_id = i.id
        and o2.created_at >= date_trunc('month', i.created_at) + interval '2 month'
        and o2.created_at < date_trunc('month', i.created_at) + interval '3 month'
      where i.deleted_at is null and i.created_at >= ${cutoff.toISOString()}
      group by 1
      order by 1
    `);
    return result.map((row) => ({
      cohortMonth: row.cohort_month,
      cohortSize: row.cohort_size,
      retainedMonth1: row.retained_month_1,
      retainedMonth2: row.retained_month_2,
    }));
  }
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}
