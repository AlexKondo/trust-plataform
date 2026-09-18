import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { resolveLocale } from '../../../../shared/i18n/locale-resolver';
import { LegalConsentService } from '../../../../shared/privacy/legal-consent.service';
import {
  CURRENT_LEGAL_DOCUMENT_VERSION,
  LEGAL_DOCUMENT_TYPES,
} from '../../../../shared/privacy/legal-documents';
import { AttributeReferralUseCase } from '../../../growth/application/usecases/referral.usecases';
import { Identity } from '../../domain/entities/identity';
import { BreachedPasswordException } from '../../domain/exceptions/breached-password.exception';
import { EmailAlreadyExistsException } from '../../domain/exceptions/email-already-exists.exception';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { PasswordBreachService } from '../../domain/services/password-breach.service';
import { PasswordHashService } from '../../domain/services/password-hash.service';
import { CreateIdentityRequest } from '../dto/create-identity.request';
import { CreateIdentityResponse } from '../dto/create-identity.response';
import { IdentityMapper } from '../mapper/identity.mapper';
import { GenerateEmailVerificationUseCase } from './generate-email-verification.usecase';

export interface RequestMetadata {
  correlationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  /** IP-002 — cabeçalho `Accept-Language` bruto; usado só para resolver o locale inicial no cadastro. */
  acceptLanguage?: string;
}

/**
 * IDN-001 — Create Identity.
 * Fluxo: verificar duplicidade (BR-001/006) → hash Argon2id (BR-002/003) →
 * criar Entity com status PENDING_EMAIL_VERIFICATION (BR-004) → persistir +
 * auditar na mesma transação. Não publica eventos — Identity.Created é do IDN-002.
 */
@Injectable()
export class CreateIdentityUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly passwordHashService: PasswordHashService,
    private readonly passwordBreachService: PasswordBreachService,
    private readonly auditLogService: AuditLogService,
    private readonly generateEmailVerification: GenerateEmailVerificationUseCase,
    private readonly legalConsentService: LegalConsentService,
    // IP-012 (Quality Gate finding #1) — resolvido via `ModuleRef` (tardio,
    // container inteiro, `strict: false`), NÃO por injeção de construtor:
    // `GrowthModule` já importa `VerificationModule`/`PaymentModule`, que
    // por sua vez importam `IdentityModule` — injetar `AttributeReferralUseCase`
    // no construtor aqui exigiria `IdentityModule` importar `GrowthModule`,
    // fechando um ciclo real de MÓDULOS ES (não só de DI) que quebra o
    // carregamento (`forwardRef` sozinho não resolve um ciclo de import de
    // arquivo, só de resolução do Nest). `ModuleRef.get(..., {strict:false})`
    // é o padrão oficial do Nest para exatamente este caso — nenhum import
    // de módulo é adicionado aqui, só o tipo (para a chamada tipada).
    private readonly moduleRef: ModuleRef,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CreateIdentityUseCase.name);
  }

  async execute(
    request: CreateIdentityRequest,
    metadata: RequestMetadata = {},
  ): Promise<CreateIdentityResponse> {
    const startedAt = Date.now();

    if (await this.identityRepository.existsByEmail(request.email)) {
      throw new EmailAlreadyExistsException();
    }

    if (await this.passwordBreachService.isBreached(request.password)) {
      throw new BreachedPasswordException();
    }

    const passwordHash = await this.passwordHashService.hash(request.password);
    // IP-002 — sem preferência salva ainda (Identity acabou de nascer): resolve
    // pelo Accept-Language do navegador, com PT-BR como fallback final.
    const preferredLocale = resolveLocale(null, metadata.acceptLanguage);
    const identity = Identity.createNew({
      fullName: request.fullName,
      email: request.email,
      passwordHash,
      preferredLocale,
    });

    await this.db.transaction(async (tx) => {
      await this.identityRepository.save(identity, tx);
      await this.auditLogService.record(
        {
          identityId: identity.id,
          operation: 'CreateIdentity',
          resource: 'Identity',
          resourceId: identity.id,
          result: 'SUCCESS',
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          correlationId: metadata.correlationId,
          requestId: metadata.requestId,
        },
        tx,
      );
      // IP-021 — captura de consentimento/versão da Política de Privacidade
      // no mesmo instante em que `terms_accepted_at` já registra o aceite dos
      // Termos de Uso (BR-005 pré-existente). Aditivo: não muda nenhum
      // comportamento de cadastro, só grava o fato em `legal_consents`.
      await this.legalConsentService.recordAcceptance(
        identity.id,
        LEGAL_DOCUMENT_TYPES.PRIVACY_POLICY,
        CURRENT_LEGAL_DOCUMENT_VERSION.PRIVACY_POLICY,
        identity.preferredLocale,
        tx,
        identity.termsAcceptedAt,
      );
    });

    // IDN-002 BR-001: toda nova Identity recebe token + e-mail de verificação.
    // Falha aqui não desfaz o cadastro — o usuário pode pedir reenvio.
    try {
      await this.generateEmailVerification.issueAndSend(identity, metadata);
    } catch (error) {
      this.logger.error(
        { err: error, operation: 'CreateIdentity', identityId: identity.id },
        'Failed to issue verification email after registration.',
      );
    }

    // IP-012 (Quality Gate finding #1) — atribuição de referral no cadastro,
    // best-effort: um código desconhecido, malformado ou de auto-referência
    // (estruturalmente impossível aqui, mas defensivo) NUNCA desfaz nem
    // bloqueia o cadastro — mesmo tratamento do e-mail de verificação acima.
    // A recompensa (se/quando decidida) não é concedida aqui — ver Conflict
    // Escalation TRUST-POINTS-ACCRUAL.
    if (request.referralCode) {
      try {
        const attributeReferral = this.moduleRef.get(AttributeReferralUseCase, { strict: false });
        await attributeReferral.execute({
          referralCode: request.referralCode,
          referredIdentityId: identity.id,
        });
      } catch (error) {
        this.logger.warn(
          { err: error, operation: 'CreateIdentity', identityId: identity.id },
          'Referral attribution failed at signup — registration proceeds unaffected.',
        );
      }
    }

    this.logger.info(
      {
        operation: 'CreateIdentity',
        identityId: identity.id,
        correlationId: metadata.correlationId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Identity created successfully.',
    );

    return IdentityMapper.toCreateResponse(identity);
  }
}
