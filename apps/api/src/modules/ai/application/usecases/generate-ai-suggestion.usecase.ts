import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AiAssistanceConfigService } from '../../infrastructure/ai-assistance-config.service';
import {
  AiAssistancePort,
  AiSuggestionResult,
  AiUnavailableReason,
  AssistQuoteDescriptionInput,
  ClarifyingQuestionsSuggestion,
  ComparisonExplanationSuggestion,
  ExplainComparisonFactorsInput,
  QuoteDescriptionSuggestion,
  StructureServiceRequestInput,
  StructuredServiceRequestSuggestion,
  SuggestClarifyingQuestionsInput,
} from '../../domain/ports/ai-assistance.port';
import { renderPromptTemplate, PromptTemplateKey } from '../../domain/prompts/prompt-templates';
import { sanitizeAiInput, SanitizableValue } from '../../domain/sanitization/sanitize-ai-input';

/**
 * Aplica `sanitizeAiInput` preservando o tipo de entrada/saída específico do
 * port — a sanitização é estruturalmente segura (mesmas chaves, nunca um
 * valor "mais largo" que o original), então o cast aqui só contorna a
 * assinatura genérica de `SanitizableValue` para os DTOs concretos do port.
 */
function sanitizeTyped<T>(value: T): T {
  return sanitizeAiInput(value as unknown as SanitizableValue) as unknown as T;
}

export interface AiRequestMeta {
  correlationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

const DISABLED_RESULT: Omit<AiSuggestionResult<unknown>, 'suggestion'> = {
  unavailableReason: 'AI_DISABLED',
  promptVersion: null,
  advisory: true,
};

/**
 * IP-019 — único ponto de entrada da aplicação para qualquer sugestão de IA.
 *
 * Responsabilidades que NENHUM caller deve reimplementar (Acceptance
 * Criteria da IP): (1) checar a feature flag — quando desligada, é um
 * true no-op, nenhum adapter é chamado; (2) aplicar timeout/fallback —
 * qualquer chamada de provedor que não responda em `timeoutMs` cai em
 * "sem sugestão", nunca propaga exceção para o caller; (3) escrever auditoria
 * (`audit_logs`, reaproveitado de IP-003/014) para toda tentativa, inclusive
 * as que falham fail-closed; (4) sanitizar entrada e resolver o template de
 * prompt versionado antes de qualquer chamada ao port.
 *
 * `AiAssistancePort` (o adapter) nunca é chamado diretamente por um
 * controller ou por outro use case — sempre através deste wrapper.
 */
@Injectable()
export class GenerateAiSuggestionUseCase {
  constructor(
    private readonly config: AiAssistanceConfigService,
    private readonly aiAssistancePort: AiAssistancePort,
    private readonly auditLogService: AuditLogService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GenerateAiSuggestionUseCase.name);
  }

  async structureServiceRequest(
    input: StructureServiceRequestInput,
    meta: AiRequestMeta = {},
  ): Promise<AiSuggestionResult<StructuredServiceRequestSuggestion>> {
    return this.run(
      'StructureServiceRequest',
      'ServiceRequest',
      input.memberId,
      'structureServiceRequest',
      { freeText: input.freeText },
      () => this.aiAssistancePort.structureServiceRequest(sanitizeTyped(input)),
      meta,
    );
  }

  async suggestClarifyingQuestions(
    input: SuggestClarifyingQuestionsInput,
    meta: AiRequestMeta = {},
  ): Promise<AiSuggestionResult<ClarifyingQuestionsSuggestion>> {
    return this.run(
      'SuggestClarifyingQuestions',
      'ServiceRequest',
      input.memberId,
      'suggestClarifyingQuestions',
      { title: input.title, description: input.description },
      () => this.aiAssistancePort.suggestClarifyingQuestions(sanitizeTyped(input)),
      meta,
    );
  }

  async assistQuoteDescription(
    input: AssistQuoteDescriptionInput,
    meta: AiRequestMeta = {},
  ): Promise<AiSuggestionResult<QuoteDescriptionSuggestion>> {
    return this.run(
      'AssistQuoteDescription',
      'Offer',
      input.partnerId,
      'assistQuoteDescription',
      { serviceCategory: input.serviceCategory, draftDescription: input.draftDescription },
      () => this.aiAssistancePort.assistQuoteDescription(sanitizeTyped(input)),
      meta,
    );
  }

  async explainComparisonFactors(
    input: ExplainComparisonFactorsInput,
    meta: AiRequestMeta = {},
  ): Promise<AiSuggestionResult<ComparisonExplanationSuggestion>> {
    return this.run(
      'ExplainComparisonFactors',
      'ServiceRequest',
      input.requesterId,
      'explainComparisonFactors',
      { factors: JSON.stringify(sanitizeTyped(input.factors)) },
      () => this.aiAssistancePort.explainComparisonFactors(sanitizeTyped(input)),
      meta,
    );
  }

  private async run<T>(
    operation: string,
    resource: string,
    identityId: string,
    templateKey: PromptTemplateKey,
    templateVariables: Record<string, string>,
    call: () => Promise<AiSuggestionResult<T>>,
    meta: AiRequestMeta,
  ): Promise<AiSuggestionResult<T>> {
    if (!this.config.enabled) {
      // True no-op: nenhum adapter, nenhum prompt renderizado, nenhuma chamada externa.
      return { suggestion: null, ...DISABLED_RESULT };
    }

    const { version: promptVersion } = renderPromptTemplate(templateKey, templateVariables);

    try {
      const result = await this.withTimeout(call(), this.config.timeoutMs);
      await this.auditLogService.recordSafe({
        identityId,
        operation,
        resource,
        result: result.suggestion ? 'SUCCESS' : 'FAILURE',
        correlationId: meta.correlationId,
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: {
          provider: this.aiAssistancePort.providerId,
          promptVersion,
          unavailableReason: result.unavailableReason,
        },
      });
      return { ...result, promptVersion: result.suggestion ? promptVersion : null };
    } catch (error) {
      const reason: AiUnavailableReason =
        error instanceof TimeoutError ? 'TIMEOUT' : this.classifyError(error);
      await this.auditLogService.recordSafe({
        identityId,
        operation,
        resource,
        result: 'FAILURE',
        correlationId: meta.correlationId,
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: {
          provider: this.aiAssistancePort.providerId,
          promptVersion,
          unavailableReason: reason,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      this.logger.warn(
        { operation, identityId, reason, correlationId: meta.correlationId },
        'AI suggestion unavailable — falling back to no-suggestion.',
      );
      // Nunca propaga: fallback gracioso é requisito de aceite desta IP.
      return {
        suggestion: null,
        unavailableReason: reason,
        promptVersion: null,
        advisory: true,
      };
    }
  }

  private classifyError(error: unknown): AiUnavailableReason {
    const code = (error as { code?: string } | undefined)?.code;
    return code === 'AI_ASSISTANCE_NOT_CONFIGURED' ? 'PROVIDER_NOT_CONFIGURED' : 'PROVIDER_ERROR';
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }
}

class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`AI assistance call exceeded timeout of ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}
