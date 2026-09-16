import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { LegalConsentService } from '../../../../shared/privacy/legal-consent.service';
import { IdentityRepository } from '../../../identity/domain/repositories/identity.repository';
import { MarketplaceOrderRepository } from '../../../marketplace/domain/repositories/marketplace-order.repository';
import { MarketplaceReviewRepository } from '../../../marketplace/domain/repositories/marketplace-review.repository';
import { ServiceRequestRepository } from '../../../marketplace/domain/repositories/service-request.repository';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { TrustPassportRepository } from '../../../trust-passport/domain/repositories/trust-passport.repository';
import { VerificationRepository } from '../../../verification/domain/repositories/verification.repository';
import { PRIVACY_REQUEST_TYPE, PrivacyRequest } from '../../domain/entities/privacy-request';
import { PrivacyRequestRepository } from '../../domain/repositories/privacy-request.repository';
import { PrivacyRequestResponse, RequestMeta } from '../dto/privacy.dtos';

const EXPORT_PAGE_SIZE = 200;

/**
 * IP-021 — "acesso/exportação" do direito de portabilidade/acesso. Processa
 * de forma SÍNCRONA (Shared Standards §1 "minimum safe design" — sem fila
 * para uma fundação) e devolve o payload exportado só na resposta desta
 * chamada; NADA da PII exportada é persistida em `privacy_requests` (só um
 * resumo de contagens, não-sensível) — decisão deliberada de privacy-by-design:
 * menos cópias de PII em repouso, ao custo de a exportação não ser
 * re-baixável depois (documentado no Completion Report §4/§11).
 */
@Injectable()
export class RequestDataExportUseCase {
  constructor(
    private readonly privacyRequestRepository: PrivacyRequestRepository,
    private readonly identityRepository: IdentityRepository,
    private readonly trustPassportRepository: TrustPassportRepository,
    private readonly verificationRepository: VerificationRepository,
    private readonly orderRepository: MarketplaceOrderRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly reviewRepository: MarketplaceReviewRepository,
    private readonly serviceRequestRepository: ServiceRequestRepository,
    private readonly legalConsentService: LegalConsentService,
    private readonly auditLogService: AuditLogService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RequestDataExportUseCase.name);
  }

  async execute(identityId: string, meta: RequestMeta = {}): Promise<PrivacyRequestResponse> {
    const now = new Date();
    const request = PrivacyRequest.createNew(identityId, PRIVACY_REQUEST_TYPE.DATA_EXPORT, now);
    request.markProcessing(now);

    const [identity, passport] = await Promise.all([
      this.identityRepository.findById(identityId),
      this.trustPassportRepository.findByIdentityId(identityId),
    ]);

    const [verifications, orders, payments, reviewsReceived, serviceRequests, legalConsents] =
      await Promise.all([
        passport ? this.verificationRepository.listByPassportId(passport.id) : Promise.resolve([]),
        this.orderRepository.listForParticipant(identityId, 1, EXPORT_PAGE_SIZE),
        this.paymentRepository.listForParticipant(identityId, 1, EXPORT_PAGE_SIZE),
        this.reviewRepository.listReviewsReceived(identityId, 1, EXPORT_PAGE_SIZE),
        this.serviceRequestRepository.findByOwner(identityId, 1, EXPORT_PAGE_SIZE),
        this.legalConsentService.listForIdentity(identityId),
      ]);

    const exportedData = {
      exportedAt: now.toISOString(),
      identity: identity
        ? {
            id: identity.id,
            fullName: identity.fullName,
            email: identity.email,
            preferredLocale: identity.preferredLocale,
            createdAt: identity.createdAt.toISOString(),
            termsAcceptedAt: identity.termsAcceptedAt.toISOString(),
          }
        : null,
      trustPassport: passport
        ? {
            phone: passport.profile.phone,
            addressCountry: passport.profile.addressCountry,
            addressState: passport.profile.addressState,
            addressCity: passport.profile.addressCity,
            emailVerified: passport.emailVerified,
            phoneVerified: passport.phoneVerified,
            documentVerified: passport.documentVerified,
            addressVerified: passport.addressVerified,
            profileCompletion: passport.profileCompletion,
          }
        : null,
      // Metadados só — nunca o storageKey interno de armazenamento nem o
      // conteúdo binário do arquivo (isso é infraestrutura, não "seu dado").
      verifications: verifications.map((verification) => ({
        id: verification.id,
        type: verification.type,
        status: verification.status,
        createdAt: verification.createdAt.toISOString(),
      })),
      orders: orders.items.map((order) => ({
        id: order.id,
        role: order.buyerId === identityId ? 'BUYER' : 'SELLER',
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        createdAt: order.createdAt.toISOString(),
        completedAt: order.completedAt?.toISOString() ?? null,
      })),
      payments: payments.items.map((payment) => ({
        id: payment.id,
        orderId: payment.orderId,
        role: payment.buyerId === identityId ? 'BUYER' : 'SELLER',
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt.toISOString(),
      })),
      reviewsReceived: reviewsReceived.items.map((review) => ({
        id: review.id,
        orderId: review.orderId,
        overallScore: review.overallScore,
        recommended: review.recommended,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
      })),
      serviceRequests: serviceRequests.items.map((serviceRequest) => ({
        id: serviceRequest.id,
        status: serviceRequest.status,
        createdAt: serviceRequest.createdAt.toISOString(),
      })),
      legalConsents: legalConsents.map((consent) => ({
        documentType: consent.documentType,
        documentVersion: consent.documentVersion,
        locale: consent.locale,
        acceptedAt: consent.acceptedAt.toISOString(),
      })),
    };

    request.complete({
      verifications: exportedData.verifications.length,
      orders: exportedData.orders.length,
      payments: exportedData.payments.length,
      reviewsReceived: exportedData.reviewsReceived.length,
      serviceRequests: exportedData.serviceRequests.length,
      legalConsents: exportedData.legalConsents.length,
    });
    await this.privacyRequestRepository.save(request);

    await this.auditLogService.recordSafe({
      identityId,
      operation: 'ExportOwnData',
      resource: 'PrivacyRequest',
      resourceId: request.id,
      result: 'SUCCESS',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
      requestId: meta.requestId,
    });

    this.logger.info(
      { operation: 'ExportOwnData', identityId, privacyRequestId: request.id, result: 'SUCCESS' },
      'Data export completed.',
    );

    return this.toResponse(request, exportedData);
  }

  private toResponse(request: PrivacyRequest, exportedData: unknown): PrivacyRequestResponse {
    return {
      id: request.id,
      type: request.type,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      processedAt: request.processedAt?.toISOString() ?? null,
      completedAt: request.completedAt?.toISOString() ?? null,
      rejectionReason: request.rejectionReason,
      resultSummary: request.resultSummary,
      exportedData,
    };
  }
}
