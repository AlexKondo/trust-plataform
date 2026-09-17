import { Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../shared/config/app-config.service';
import { Public } from '../../shared/security/public.decorator';
import { OutboxRelayService } from '../../shared/events/outbox-relay.service';

/**
 * [Internal] Gatilho machine-to-machine do drain do outbox — NÃO é parte da
 * API pública do produto. Migração Render → Vercel (2026-09-17): sem um
 * processo residente para rodar `setInterval`, um agendador externo
 * (GitHub Actions cron, a cada 5min) chama esta rota via HTTP.
 *
 * Autenticação: header compartilhado `x-internal-job-secret`, comparado em
 * tempo constante — NÃO usa JWT/identidade de usuário (rota é @Public() no
 * sentido do guard global, mas protegida por este segredo próprio). O valor
 * do segredo NUNCA é logado.
 */
@Controller('internal/jobs')
export class InternalJobsController {
  constructor(
    private readonly config: AppConfigService,
    private readonly outboxRelay: OutboxRelayService,
  ) {}

  @Public()
  @Post('outbox-relay')
  async runOutboxRelay(
    @Headers('x-internal-job-secret') providedSecret: string | undefined,
  ): Promise<{ processed: number }> {
    this.assertAuthorized(providedSecret);
    return this.outboxRelay.drainOnce({ maxDurationMs: 50_000 });
  }

  private assertAuthorized(providedSecret: string | undefined): void {
    const expected = this.config.internalJobSecret;
    if (!expected || !providedSecret || !this.constantTimeEquals(providedSecret, expected)) {
      throw new ForbiddenException('Not authorized.');
    }
  }

  /** Evita side-channel de timing na comparação do segredo (DOC-002/security). */
  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Ainda assim compara contra si mesma para não vazar timing pelo length-check
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
