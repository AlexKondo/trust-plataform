import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AnalyticsController } from './infrastructure/api/analytics.controller';
import { AnalyticsRepository } from './infrastructure/persistence/analytics.repository';

/**
 * IP-020 — módulo de analytics/inteligência operacional.
 *
 * `IdentityModule` é importado apenas para resolver `AdminGuard` (exportado
 * por aquele módulo, mesmo padrão de `TrustScoreModule`/`MarketplaceModule`
 * para suas próprias rotas `admin/*`) — este módulo não importa
 * `MarketplaceModule`/`PaymentModule` porque não usa nenhum provider
 * daqueles módulos: `AnalyticsRepository` lê as tabelas deles diretamente
 * via schema Drizzle (ver comentário em `analytics.repository.ts`), não via
 * injeção de um repositório de domínio de outro módulo. Zero arquivo de
 * `marketplace/**`/`payment/**` é importado como PROVIDER aqui.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsRepository],
})
export class AnalyticsModule {}
