import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import type { AuditLogEntry } from '../../../../shared/audit/audit-log.service';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AiAssistanceNotConfiguredException } from '../../domain/exceptions/ai-assistance.exceptions';
import { AiAssistancePort } from '../../domain/ports/ai-assistance.port';
import { AiAssistanceConfigService } from '../../infrastructure/ai-assistance-config.service';
import { NotConfiguredAiAssistanceAdapter } from '../../infrastructure/not-configured-ai-assistance.adapter';
import { GenerateAiSuggestionUseCase } from './generate-ai-suggestion.usecase';

const mockLogger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function buildConfig(overrides: { enabled?: boolean; timeoutMs?: number } = {}) {
  return new AiAssistanceConfigService({
    aiAssistanceEnabled: overrides.enabled ?? true,
    aiProviderApiKey: undefined,
    aiAssistanceTimeoutMs: overrides.timeoutMs ?? 50,
  });
}

function buildAuditLog() {
  return { record: vi.fn(), recordSafe: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
}

describe('GenerateAiSuggestionUseCase', () => {
  describe('feature flag OFF — true no-op', () => {
    it('nunca chama o adapter e devolve AI_DISABLED, sem gravar em audit_logs', async () => {
      const port = { providerId: 'not-configured', structureServiceRequest: vi.fn() } as unknown as AiAssistancePort;
      const auditLogService = buildAuditLog();
      const useCase = new GenerateAiSuggestionUseCase(
        buildConfig({ enabled: false }),
        port,
        auditLogService,
        mockLogger(),
      );

      const result = await useCase.structureServiceRequest({
        memberId: 'member-1',
        freeText: 'minha torneira vaza',
        locale: 'pt-BR',
      });

      expect(result).toEqual({
        suggestion: null,
        unavailableReason: 'AI_DISABLED',
        promptVersion: null,
        advisory: true,
      });
      expect(port.structureServiceRequest).not.toHaveBeenCalled();
      expect(auditLogService.recordSafe).not.toHaveBeenCalled();
    });
  });

  describe('fail-closed NotConfigured adapter', () => {
    it('flag ligada + adapter fail-closed real → PROVIDER_NOT_CONFIGURED, nunca propaga a exceção', async () => {
      const port = new NotConfiguredAiAssistanceAdapter();
      const auditLogService = buildAuditLog();
      const useCase = new GenerateAiSuggestionUseCase(
        buildConfig({ enabled: true }),
        port,
        auditLogService,
        mockLogger(),
      );

      const result = await useCase.structureServiceRequest({
        memberId: 'member-1',
        freeText: 'preciso de um eletricista',
        locale: 'pt-BR',
      });

      expect(result.suggestion).toBeNull();
      expect(result.unavailableReason).toBe('PROVIDER_NOT_CONFIGURED');
      expect(result.advisory).toBe(true);
      expect(auditLogService.recordSafe).toHaveBeenCalledTimes(1);
      const recordSafeMock = auditLogService.recordSafe as unknown as ReturnType<
        typeof vi.fn<(entry: AuditLogEntry) => Promise<void>>
      >;
      const entry = recordSafeMock.mock.calls[0]?.[0];
      expect(entry?.result).toBe('FAILURE');
      expect(entry?.metadata?.unavailableReason).toBe('PROVIDER_NOT_CONFIGURED');
    });

    it('propaga AiAssistanceNotConfiguredException do adapter apenas internamente (nunca até o caller)', async () => {
      const port = new NotConfiguredAiAssistanceAdapter();
      vi.spyOn(port, 'structureServiceRequest').mockImplementation(() => {
        throw new AiAssistanceNotConfiguredException('structureServiceRequest');
      });
      const useCase = new GenerateAiSuggestionUseCase(
        buildConfig({ enabled: true }),
        port,
        buildAuditLog(),
        mockLogger(),
      );

      await expect(
        useCase.structureServiceRequest({ memberId: 'm1', freeText: 'x', locale: 'pt-BR' }),
      ).resolves.not.toThrow();
    });
  });

  describe('timeout/fallback', () => {
    it('provedor lento (nunca resolve) → fallback para no-suggestion após timeoutMs, nunca lança', async () => {
      const hangingPort = {
        providerId: 'slow-provider',
        structureServiceRequest: () => new Promise(() => {}), // nunca resolve
      } as unknown as AiAssistancePort;
      const auditLogService = buildAuditLog();
      const useCase = new GenerateAiSuggestionUseCase(
        buildConfig({ enabled: true, timeoutMs: 20 }),
        hangingPort,
        auditLogService,
        mockLogger(),
      );

      const result = await useCase.structureServiceRequest({
        memberId: 'member-1',
        freeText: 'x',
        locale: 'pt-BR',
      });

      expect(result.suggestion).toBeNull();
      expect(result.unavailableReason).toBe('TIMEOUT');
      const recordSafeMock = auditLogService.recordSafe as unknown as ReturnType<
        typeof vi.fn<(entry: AuditLogEntry) => Promise<void>>
      >;
      const entry = recordSafeMock.mock.calls[0]?.[0];
      expect(entry?.metadata?.unavailableReason).toBe('TIMEOUT');
    }, 2000);
  });

  describe('audit log', () => {
    it('grava uma entrada em audit_logs (via AuditLogService.recordSafe) para toda tentativa com a flag ligada', async () => {
      const port = new NotConfiguredAiAssistanceAdapter();
      const auditLogService = buildAuditLog();
      const useCase = new GenerateAiSuggestionUseCase(
        buildConfig({ enabled: true }),
        port,
        auditLogService,
        mockLogger(),
      );

      await useCase.assistQuoteDescription({
        partnerId: 'partner-1',
        draftDescription: 'troco torneiras',
        serviceCategory: 'plumbing',
        locale: 'pt-BR',
      });

      expect(auditLogService.recordSafe).toHaveBeenCalledWith(
        expect.objectContaining({
          identityId: 'partner-1',
          operation: 'AssistQuoteDescription',
          resource: 'Offer',
          result: 'FAILURE',
        }),
      );
    });
  });

  describe('output shape — sempre advisory', () => {
    it('advisory é sempre true, mesmo em sucesso simulado', async () => {
      const port = {
        providerId: 'fake',
        explainComparisonFactors: vi.fn().mockResolvedValue({
          suggestion: { explanation: 'x' },
          unavailableReason: null,
          promptVersion: null,
          advisory: true,
        }),
      } as unknown as AiAssistancePort;
      const useCase = new GenerateAiSuggestionUseCase(
        buildConfig({ enabled: true }),
        port,
        buildAuditLog(),
        mockLogger(),
      );

      const result = await useCase.explainComparisonFactors({
        requesterId: 'r1',
        factors: [{ label: 'price', value: 'R$100' }],
        locale: 'pt-BR',
      });

      expect(result.advisory).toBe(true);
      expect(result.suggestion).toEqual({ explanation: 'x' });
      expect(result.promptVersion).toBe('v1');
    });
  });
});
