import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { RequestMeta } from '../../marketplace/application/dto/marketplace.dtos';
import { AdminOpsRepository } from '../infrastructure/persistence/admin-ops.repository';

/**
 * IP-018 — "support pode rastrear um pedido/pagamento de ponta a ponta"
 * (acceptance criteria). Nenhum lookup genérico de tabela: sempre resolve
 * por um identificador de negócio (email/orderId/paymentId) e devolve uma
 * VIEW consolidada, nunca a linha crua. Mascaramento deliberado (trust-
 * security §6): nunca devolve `passwordHash` (a query de identidade já nem
 * seleciona a coluna) nem dado de pagamento além do necessário para suporte.
 */
@Injectable()
export class SupportLookupService {
  constructor(
    private readonly repo: AdminOpsRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async lookupByEmail(adminIdentityId: string, email: string, meta: RequestMeta = {}) {
    const identity = await this.repo.findIdentityByEmail(email);
    if (!identity) {
      throw new NotFoundException({ code: 'IDENTITY_NOT_FOUND', message: 'No identity for this email.' });
    }
    return this.buildIdentityView(adminIdentityId, identity, meta);
  }

  async lookupByOrderId(adminIdentityId: string, orderId: string, meta: RequestMeta = {}) {
    const order = await this.repo.findOrderById(orderId);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found.' });
    }
    const payment = await this.repo.findPaymentByOrderId(order.id);

    await this.auditLogService.recordSafe({
      identityId: adminIdentityId,
      operation: 'AdminSupportLookup',
      resource: 'MarketplaceOrder',
      resourceId: order.id,
      result: 'SUCCESS',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
      requestId: meta.requestId,
      metadata: { lookupBy: 'orderId' },
    });

    return {
      order: this.maskOrder(order),
      payment: payment ? this.maskPayment(payment) : null,
    };
  }

  async lookupByPaymentId(adminIdentityId: string, paymentId: string, meta: RequestMeta = {}) {
    const payment = await this.repo.findPaymentById(paymentId);
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
    }
    const order = await this.repo.findOrderById(payment.orderId);

    await this.auditLogService.recordSafe({
      identityId: adminIdentityId,
      operation: 'AdminSupportLookup',
      resource: 'Payment',
      resourceId: payment.id,
      result: 'SUCCESS',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
      requestId: meta.requestId,
      metadata: { lookupBy: 'paymentId' },
    });

    return {
      payment: this.maskPayment(payment),
      order: order ? this.maskOrder(order) : null,
    };
  }

  private async buildIdentityView(
    adminIdentityId: string,
    identity: NonNullable<Awaited<ReturnType<AdminOpsRepository['findIdentityByEmail']>>>,
    meta: RequestMeta,
  ) {
    const orders = await this.repo.listOrdersForIdentity(identity.id);

    await this.auditLogService.recordSafe({
      identityId: adminIdentityId,
      operation: 'AdminSupportLookup',
      resource: 'Identity',
      resourceId: identity.id,
      result: 'SUCCESS',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
      requestId: meta.requestId,
      metadata: { lookupBy: 'email' },
    });

    return {
      identity: {
        id: identity.id,
        fullName: identity.fullName,
        // e-mail é o dado que o support digitou para achar — devolver de
        // volta não é uma exposição nova; nunca devolvemos telefone/documento
        // aqui porque nenhuma dessas colunas é lida por esta query.
        email: identity.email,
        status: identity.status,
        isAdmin: identity.isAdmin,
        createdAt: identity.createdAt,
        lastLoginAt: identity.lastLoginAt,
      },
      orders: orders.map((order) => this.maskOrder(order)),
    };
  }

  private maskOrder(order: {
    id: string;
    status: string;
    buyerId: string;
    sellerId: string;
    amount: string;
    currency: string;
    createdAt: Date;
  }) {
    return {
      orderId: order.id,
      status: order.status,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      amount: order.amount,
      currency: order.currency,
      createdAt: order.createdAt,
    };
  }

  private maskPayment(payment: {
    id: string;
    orderId: string;
    status: string;
    amount: string;
    currency: string;
    refundedAmount: string;
    paymentProviderId: string | null;
    createdAt: Date;
  }) {
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      refundedAmount: payment.refundedAmount,
      // provider id só (nunca token/instrumento adjacente a cartão — IP-009).
      paymentProviderId: payment.paymentProviderId,
      createdAt: payment.createdAt,
    };
  }
}
