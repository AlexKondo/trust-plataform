import { Module } from '@nestjs/common';
import { PaymentRepository } from './domain/repositories/payment.repository';
import { PaymentGateway } from './domain/services/payment-gateway';
import { CreatePaymentOnOrderConsumer } from './infrastructure/consumers/create-payment.consumer';
import { PaymentProviderResolver } from './infrastructure/gateway/payment-provider.resolver';
import { SandboxPaymentGateway } from './infrastructure/gateway/sandbox-payment.gateway';
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
  providers: [
    SandboxPaymentGateway,
    PaymentProviderResolver,
    CreatePaymentOnOrderConsumer,
    { provide: PaymentRepository, useClass: DrizzlePaymentRepository },
    // O port resolve para o adapter padrão; operações que precisam voltar ao
    // provedor original usam o resolver, não esta injeção.
    { provide: PaymentGateway, useExisting: SandboxPaymentGateway },
  ],
  exports: [PaymentRepository, PaymentProviderResolver],
})
export class PaymentModule {}
