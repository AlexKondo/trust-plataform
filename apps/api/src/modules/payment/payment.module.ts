import { Module } from '@nestjs/common';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { AuthorizePaymentUseCase } from './application/usecases/authorize-payment.usecase';
import { GetPaymentUseCase } from './application/usecases/get-payment.usecase';
import { HoldFundsUseCase } from './application/usecases/hold-funds.usecase';
import { ReleaseFundsUseCase } from './application/usecases/release-funds.usecase';
import { PaymentAuthorizationRepository } from './domain/repositories/payment-authorization.repository';
import { PaymentRepository } from './domain/repositories/payment.repository';
import { TrustCustodyRepository } from './domain/repositories/trust-custody.repository';
import { OrderDisputeQuery } from './domain/services/order-dispute.query';
import { PaymentGateway } from './domain/services/payment-gateway';
import { PaymentController } from './infrastructure/api/payment.controller';
import { CreatePaymentOnOrderConsumer } from './infrastructure/consumers/create-payment.consumer';
import { FinalizeReleaseConsumer } from './infrastructure/consumers/finalize-release.consumer';
import { HoldFundsOnAuthorizedConsumer } from './infrastructure/consumers/hold-funds.consumer';
import { PrepareReleaseOnCustomerConfirmedConsumer } from './infrastructure/consumers/release-funds.consumer';
import { PaymentProviderResolver } from './infrastructure/gateway/payment-provider.resolver';
import { SandboxPaymentGateway } from './infrastructure/gateway/sandbox-payment.gateway';
import { MarketplaceOrderDisputeQuery } from './infrastructure/marketplace/marketplace-dispute.query';
import { DrizzlePaymentAuthorizationRepository } from './infrastructure/persistence/drizzle-payment-authorization.repository';
import { DrizzlePaymentRepository } from './infrastructure/persistence/drizzle-payment.repository';
import { DrizzleTrustCustodyRepository } from './infrastructure/persistence/drizzle-trust-custody.repository';

/**
 * Módulo Payments (PAY-001..010).
 *
 * Duas decisões de arquitetura mandam aqui:
 * - **Ports & Adapters** (PAY-ARCH-001): o domínio conhece só `PaymentGateway`;
 *   trocar de provedor é adicionar um adapter e ajustar o resolver.
 * - **Custódia** (PAY-ARCH-002): a plataforma segura o dinheiro e só libera
 *   quando a política aprova — é isso que gera confiança, não o gateway.
 *
 * O Marketplace não conhece este módulo: tudo chega por evento.
 */
@Module({
  // Leitura da disputa para a política de liberação (PACK-01 §10). O sentido é
  // só este: Payments lê Marketplace; o Marketplace continua sem conhecer
  // Payments, e tudo que vai na direção contrária vai por evento.
  imports: [MarketplaceModule],
  controllers: [PaymentController],
  providers: [
    SandboxPaymentGateway,
    PaymentProviderResolver,
    CreatePaymentOnOrderConsumer,
    HoldFundsOnAuthorizedConsumer,
    PrepareReleaseOnCustomerConfirmedConsumer,
    FinalizeReleaseConsumer,
    AuthorizePaymentUseCase,
    GetPaymentUseCase,
    HoldFundsUseCase,
    ReleaseFundsUseCase,
    { provide: PaymentRepository, useClass: DrizzlePaymentRepository },
    {
      provide: PaymentAuthorizationRepository,
      useClass: DrizzlePaymentAuthorizationRepository,
    },
    { provide: TrustCustodyRepository, useClass: DrizzleTrustCustodyRepository },
    { provide: OrderDisputeQuery, useClass: MarketplaceOrderDisputeQuery },
    // O port resolve para o adapter padrão; operações que precisam voltar ao
    // provedor original usam o resolver, não esta injeção.
    { provide: PaymentGateway, useExisting: SandboxPaymentGateway },
  ],
  exports: [
    PaymentRepository,
    PaymentAuthorizationRepository,
    TrustCustodyRepository,
    PaymentProviderResolver,
  ],
})
export class PaymentModule {}
