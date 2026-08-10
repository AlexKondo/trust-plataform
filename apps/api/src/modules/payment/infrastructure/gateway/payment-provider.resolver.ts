import { Injectable } from '@nestjs/common';
import { PaymentGateway } from '../../domain/services/payment-gateway';
import { SandboxPaymentGateway } from './sandbox-payment.gateway';

/**
 * Escolhe o provedor para cada operação (PAY-ARCH-001 §7).
 *
 * Existe para que o domínio **não conheça** os critérios de seleção (país,
 * moeda, custo, disponibilidade, categoria do parceiro). Hoje há um provedor
 * só; quando entrar o segundo, a regra muda aqui e em nenhum outro lugar.
 */
@Injectable()
export class PaymentProviderResolver {
  private readonly gateways: PaymentGateway[];

  constructor(sandbox: SandboxPaymentGateway) {
    this.gateways = [sandbox];
  }

  /** Provedor para uma nova operação. Critérios entram aqui, não no domínio. */
  resolve(_context: { currency: string; countryCode?: string }): PaymentGateway {
    return this.gateways[0]!;
  }

  /**
   * Provedor que executou uma operação anterior. Estorno e captura precisam
   * voltar ao MESMO provedor que autorizou — nunca ao "provedor da vez".
   */
  byProviderId(providerId: string): PaymentGateway {
    const gateway = this.gateways.find((candidate) => candidate.providerId === providerId);
    if (!gateway) {
      throw new Error(`No payment gateway registered for provider "${providerId}".`);
    }
    return gateway;
  }
}
