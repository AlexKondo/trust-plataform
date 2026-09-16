import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import {
  CohortQuery,
  DateRangeQuery,
  cohortQuerySchema,
  dateRangeQuerySchema,
  resolveDateRange,
} from '../../application/dto/analytics.dtos';
import { calculateRate } from '../../domain/services/rate';
import { AnalyticsRepository } from '../persistence/analytics.repository';

/**
 * IP-020 — API de analytics/inteligência operacional, ADMIN-ONLY
 * (`AdminGuard`, mesmo padrão de `admin/trust-score-rules`/`admin/marketplace/disputes`
 * — a flag `is_admin` é reavaliada a cada requisição, nunca confiada no
 * token, DOC-002).
 *
 * Fronteira de privacidade deliberada (IP-021 §7 / Shared Standards §7):
 * toda resposta aqui é AGREGADA (contagem, soma, média, taxa) — nenhum
 * endpoint devolve uma linha identificável por pessoa (nome, e-mail,
 * localização precisa). Isto não é um esquecimento a corrigir depois: é o
 * contrato desta API. Um admin que precisa investigar um caso INDIVIDUAL já
 * tem as telas de moderação existentes (`/admin/disputes`,
 * `/admin/verifications`, `/verifications/:id` — auditadas por
 * `GetVerificationUseCase`, IP-021 §3.5); esta API nunca duplica esse acesso
 * em forma de "dump" bruto (IP-020 spec §4: "no sensitive raw-data dump").
 */
@Controller('admin/analytics')
@UseGuards(AdminGuard)
export class AnalyticsController {
  constructor(private readonly repository: AnalyticsRepository) {}

  @Get('overview')
  async getOverview(@Query(new ZodValidationPipe(dateRangeQuerySchema)) query: DateRangeQuery) {
    const range = resolveDateRange(query);
    const [funnel, outcomes, payments, timing] = await Promise.all([
      this.repository.getFunnelCounts(range),
      this.repository.getOutcomeCounts(range),
      this.repository.getPaymentAuthorizationCounts(range),
      this.repository.getTimingMetrics(range),
    ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      funnel: {
        requestsCreated: funnel.requestsCreated,
        requestsMatched: funnel.requestsMatched,
        offersCreated: funnel.offersCreated,
        ordersCreated: funnel.ordersCreated,
        executionCompleted: funnel.executionCompleted,
        customerConfirmed: funnel.customerConfirmed,
        paymentsReleased: funnel.paymentsReleased,
        grossOrderValueCents: funnel.grossOrderValueCents,
        releasedCustodyValueCents: funnel.releasedCustodyValueCents,
      },
      conversion: {
        requestToMatch: calculateRate(funnel.requestsMatched, funnel.requestsCreated),
        offerToOrder: calculateRate(funnel.ordersCreated, funnel.offersCreated),
        orderToExecution: calculateRate(funnel.executionCompleted, funnel.ordersCreated),
        executionToConfirmation: calculateRate(funnel.customerConfirmed, funnel.executionCompleted),
        confirmationToPayment: calculateRate(funnel.paymentsReleased, funnel.customerConfirmed),
      },
      outcomes: {
        ordersCreated: outcomes.ordersCreated,
        completionRate: calculateRate(outcomes.ordersCompleted, outcomes.ordersCreated),
        cancellationRate: calculateRate(outcomes.ordersCancelled, outcomes.ordersCreated),
        disputeRate: calculateRate(outcomes.ordersDisputed, outcomes.ordersCreated),
      },
      payments: {
        authorizationsAttempted: payments.attempted,
        authorizationsApproved: payments.approved,
        paymentSuccessRate: calculateRate(payments.approved, payments.attempted),
      },
      timing,
    };
  }

  @Get('trust-adoption')
  async getTrustAdoption() {
    const snapshot = await this.repository.getTrustAdoption();
    return {
      activeIdentities: snapshot.activeIdentities,
      identitiesWithPassport: snapshot.identitiesWithPassport,
      passportAdoptionRate: calculateRate(snapshot.identitiesWithPassport, snapshot.activeIdentities),
      documentVerifiedShare: calculateRate(snapshot.documentVerifiedPassports, snapshot.totalPassports),
      levelDistribution: snapshot.levelDistribution,
    };
  }

  @Get('cohorts')
  async getCohorts(@Query(new ZodValidationPipe(cohortQuerySchema)) query: CohortQuery) {
    const cohorts = await this.repository.getCohortRetention(query.months);
    return cohorts.map((cohort) => ({
      cohortMonth: cohort.cohortMonth,
      cohortSize: cohort.cohortSize,
      retainedMonth1: cohort.retainedMonth1,
      retainedMonth2: cohort.retainedMonth2,
      retentionRateMonth1: calculateRate(cohort.retainedMonth1, cohort.cohortSize),
      retentionRateMonth2: calculateRate(cohort.retainedMonth2, cohort.cohortSize),
    }));
  }
}
