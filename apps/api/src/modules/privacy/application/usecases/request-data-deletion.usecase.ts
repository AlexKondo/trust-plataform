import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { RateLimitService } from '../../../../shared/safety/rate-limit.service';
import { IdentityRepository } from '../../../identity/domain/repositories/identity.repository';
import { SessionRepository } from '../../../identity/domain/repositories/session.repository';
import { TrustPassportRepository } from '../../../trust-passport/domain/repositories/trust-passport.repository';
import {
  PRIVACY_REQUEST_STATUS,
  PRIVACY_REQUEST_TYPE,
  PrivacyRequest,
} from '../../domain/entities/privacy-request';
import { PrivacyRequestNotFoundException } from '../../domain/exceptions/privacy.exceptions';
import { PrivacyRequestRepository } from '../../domain/repositories/privacy-request.repository';
import { PrivacyRequestResponse, RequestMeta } from '../dto/privacy.dtos';
import { DeletionEligibilityService } from '../services/deletion-eligibility.service';

/**
 * IP-021 — "exclusão" (na verdade, anonimização + soft-delete). Processa de
 * forma SÍNCRONA dentro de uma única transação.
 *
 * IP-021 Diff Review §6 (finding #1, BLOCKING, corrigido nesta versão): a
 * checagem de elegibilidade (`DeletionEligibilityService.checkEligibility`)
 * é a ÚNICA leitura que decide se esta Identity pode ser anonimizada — e por
 * isso ela roda DENTRO desta transação, pela conexão da própria transação
 * (`tx`), como a ÚLTIMA coisa lida antes de mutar. Uma versão anterior
 * checava a elegibilidade ANTES de abrir a transação (uma conexão separada
 * do pool, com uma leitura de Trust Passport e a abertura de uma nova
 * transação no meio) — isso deixava uma janela real de TOCTOU: um pedido ou
 * custódia concorrente podia ser criado depois da checagem e antes da
 * mutação, sem que nada aqui percebesse, e a Identity era anonimizada mesmo
 * assim. O Diff Review reproduziu isso empiricamente contra o Postgres real.
 * Não basta subir o nível de isolamento da transação — SERIALIZABLE só
 * detecta conflito em cima de uma leitura que a própria transação fez; se a
 * checagem nunca lê a tabela de pedidos DE DENTRO desta transação, não há
 * nada para o Postgres comparar. Mover a checagem para cá, na mesma conexão,
 * imediatamente antes da mutação, sem nenhuma outra chamada de rede/E-S no
 * meio, é o que fecha essa janela.
 *
 * 1. Abre a transação; dentro dela, roda `checkEligibility(identityId, tx)`.
 *    Se bloqueado: marca a solicitação REJECTED com o motivo em código
 *    estável, grava a auditoria (`result: DENIED`) e a transação COMMITA
 *    esse resultado — nada de `identities`/`trust_passports`/`sessions` é
 *    tocado.
 * 2. Se elegível: anonimiza `identities` (nome/e-mail/hash de senha,
 *    soft-delete via `deleted_at`) e `trust_passports` (telefone/endereço),
 *    revoga todas as sessões, e marca a solicitação COMPLETED — tudo na
 *    MESMA transação (ou tudo aplica, ou nada aplica).
 *
 * NUNCA toca `payments`, `payment_authorizations`, `trust_custodies`,
 * `payment_incremental_authorizations`, `incremental_trust_custodies`,
 * `audit_logs`, eventos de execução/Change Order, Trust Score/reputação, ou
 * qualquer verificação/evidência de identidade — ver
 * `apps/api/src/shared/privacy/data-classification.ts` e o Completion Report
 * §8/§9 para a justificativa tabela a tabela.
 */
@Injectable()
export class RequestDataDeletionUseCase {
  constructor(
    private readonly privacyRequestRepository: PrivacyRequestRepository,
    private readonly identityRepository: IdentityRepository,
    private readonly trustPassportRepository: TrustPassportRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly eligibilityService: DeletionEligibilityService,
    private readonly auditLogService: AuditLogService,
    private readonly rateLimitService: RateLimitService,
    private readonly config: AppConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RequestDataDeletionUseCase.name);
  }

  async execute(identityId: string, meta: RequestMeta = {}): Promise<PrivacyRequestResponse> {
    const now = new Date();
    const identity = await this.identityRepository.findById(identityId);
    if (!identity) {
      throw new PrivacyRequestNotFoundException();
    }

    // IP-014: uma conta destrutiva demais rápido é o padrão clássico de abuso
    // (conta comprometida tentando repetidas exclusões, ou script de
    // automação). O rate limit é canônico (RateLimitService); a negativa é
    // auditada explicitamente aqui, como o lockout de login já faz, porque o
    // GlobalExceptionFilter não grava audit_logs sozinho.
    try {
      await this.rateLimitService.assertWithinLimit(identityId, 'RequestDataDeletion', {
        maxAttempts: this.config.sensitiveActionRateLimitMaxAttempts,
        windowMinutes: this.config.sensitiveActionRateLimitWindowMinutes,
      });
    } catch (error) {
      await this.auditLogService.recordSafe({
        identityId,
        operation: 'RequestDataDeletion',
        resource: 'PrivacyRequest',
        result: 'DENIED',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
        requestId: meta.requestId,
        metadata: { reason: 'RATE_LIMIT_EXCEEDED' },
      });
      throw error;
    }

    // Lido ANTES da transação — não é o que decide se a exclusão prossegue
    // (isso é só o `checkEligibility` de dentro da transação, abaixo), então
    // uma leitura ligeiramente desatualizada aqui não é um problema de
    // segurança: o pior caso é montar um `TrustPassport` que, um instante
    // depois, também precisaria ter sido buscado de novo — mas ele próprio
    // nunca é a fonte da decisão de elegibilidade.
    const passport = await this.trustPassportRepository.findByIdentityId(identityId);

    const request = PrivacyRequest.createNew(identityId, PRIVACY_REQUEST_TYPE.DATA_DELETION, now);
    request.markProcessing(now);

    await this.db.transaction(async (tx) => {
      // Checagem AUTORITATIVA — dentro da transação, pela conexão da
      // transação, imediatamente antes de mutar. Ver o comentário da classe
      // para por que isto (e não uma checagem antes de abrir a transação,
      // nem só subir o isolation level) é o que fecha o TOCTOU do Diff
      // Review §6.
      const blockingReason = await this.eligibilityService.checkEligibility(identityId, tx);

      if (blockingReason) {
        request.reject(blockingReason, now);
        await this.privacyRequestRepository.save(request, tx);
        await this.auditLogService.record(
          {
            identityId,
            operation: 'RequestDataDeletion',
            resource: 'PrivacyRequest',
            resourceId: request.id,
            result: 'DENIED',
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            correlationId: meta.correlationId,
            requestId: meta.requestId,
            metadata: { reason: blockingReason },
          },
          tx,
        );
        return;
      }

      identity.anonymize(now);
      await this.identityRepository.save(identity, tx);

      if (passport) {
        passport.anonymizeProfile(now);
        await this.trustPassportRepository.save(passport, tx);
      }

      await this.sessionRepository.revokeAllByIdentity(identityId, tx);

      request.complete({ passportAnonymized: passport ? 1 : 0 }, now);
      await this.privacyRequestRepository.save(request, tx);

      await this.auditLogService.record(
        {
          identityId,
          operation: 'AnonymizeIdentity',
          resource: 'Identity',
          resourceId: identityId,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
        },
        tx,
      );
    });

    if (request.status === PRIVACY_REQUEST_STATUS.REJECTED) {
      this.logger.warn(
        {
          operation: 'RequestDataDeletion',
          identityId,
          reason: request.rejectionReason,
          result: 'DENIED',
        },
        'Account deletion blocked by active obligations.',
      );
    } else {
      this.logger.info(
        { operation: 'RequestDataDeletion', identityId, privacyRequestId: request.id, result: 'SUCCESS' },
        'Identity anonymized following a data deletion request.',
      );
    }

    return this.toResponse(request);
  }

  private toResponse(request: PrivacyRequest): PrivacyRequestResponse {
    return {
      id: request.id,
      type: request.type,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      processedAt: request.processedAt?.toISOString() ?? null,
      completedAt: request.completedAt?.toISOString() ?? null,
      rejectionReason: request.rejectionReason,
      resultSummary: request.resultSummary,
    };
  }
}
