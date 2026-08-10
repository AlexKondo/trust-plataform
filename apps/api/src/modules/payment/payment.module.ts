import { Module } from '@nestjs/common';
import { AuthorizePaymentUseCase } from './application/usecases/authorize-payment.usecase';
import { GetPaymentUseCase } from './application/usecases/get-payment.usecase';
import { PaymentAuthorizationRepository } from './domain/repositories/payment-authorization.repository';
import { PaymentRepository } from './domain/repositories/payment.repository';
import { PaymentGateway } from './domain/services/payment-gateway';
import { PaymentController } from './infrastructure/api/payment.controller';
import { CreatePaymentOnOrderConsumer } from './infrastructure/consumers/create-payment.consumer';
import { PaymentProviderResolver } from './infrastructure/gateway/payment-provider.resolver';
import { SandboxPaymentGateway } from './infrastructure/gateway/sandbox-payment.gateway';
import { DrizzlePaymentAuthorizationRepository } from './infrastructure/persistence/drizzle-payment-authorization.repository';
import { DrizzlePaymentRepository } from './infrastructure/persistence/drizzle-payment.repository';

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
  controllers: [PaymentController],
  providers: [
    SandboxPaymentGateway,
    PaymentProviderResolver,
    CreatePaymentOnOrderConsumer,
    AuthorizePaymentUseCase,
    GetPaymentUseCase,
    { provide: PaymentRepository, useClass: DrizzlePaymentRepository },
    {
      provide: PaymentAuthorizationRepository,
      useClass: DrizzlePaymentAuthorizationRepository,
    },
    // O port resolve para o adapter padrão; operações que precisam voltar ao
    // provedor original usam o resolver, não esta injeção.
    { provide: PaymentGateway, useExisting: SandboxPaymentGateway },
  ],
  exports: [PaymentRepository, PaymentAuthorizationRepository, PaymentProviderResolver],
})
export class PaymentModule {}
