import { describe, expect, it } from 'vitest';
import { AiAssistanceNotConfiguredException } from '../domain/exceptions/ai-assistance.exceptions';
import { NotConfiguredAiAssistanceAdapter } from './not-configured-ai-assistance.adapter';

describe('NotConfiguredAiAssistanceAdapter — fail-closed (mirrors AsaasNotConfiguredException pattern)', () => {
  const adapter = new NotConfiguredAiAssistanceAdapter();

  it('providerId é "not-configured"', () => {
    expect(adapter.providerId).toBe('not-configured');
  });

  it('structureServiceRequest lança AiAssistanceNotConfiguredException (503)', async () => {
    await expect(
      adapter.structureServiceRequest({ memberId: 'm1', freeText: 'x', locale: 'pt-BR' }),
    ).rejects.toBeInstanceOf(AiAssistanceNotConfiguredException);
  });

  it('suggestClarifyingQuestions lança AiAssistanceNotConfiguredException', async () => {
    await expect(
      adapter.suggestClarifyingQuestions({
        memberId: 'm1',
        title: 't',
        description: 'd',
        locale: 'pt-BR',
      }),
    ).rejects.toBeInstanceOf(AiAssistanceNotConfiguredException);
  });

  it('assistQuoteDescription lança AiAssistanceNotConfiguredException', async () => {
    await expect(
      adapter.assistQuoteDescription({
        partnerId: 'p1',
        draftDescription: 'd',
        serviceCategory: 'plumbing',
        locale: 'pt-BR',
      }),
    ).rejects.toBeInstanceOf(AiAssistanceNotConfiguredException);
  });

  it('explainComparisonFactors lança AiAssistanceNotConfiguredException', async () => {
    await expect(
      adapter.explainComparisonFactors({ requesterId: 'r1', factors: [], locale: 'pt-BR' }),
    ).rejects.toBeInstanceOf(AiAssistanceNotConfiguredException);
  });

  it('a exceção carrega code=AI_ASSISTANCE_NOT_CONFIGURED e httpStatus=503, igual ao padrão do IP-009', async () => {
    try {
      await adapter.structureServiceRequest({ memberId: 'm1', freeText: 'x', locale: 'pt-BR' });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as AiAssistanceNotConfiguredException).code).toBe(
        'AI_ASSISTANCE_NOT_CONFIGURED',
      );
      expect((error as AiAssistanceNotConfiguredException).httpStatus).toBe(503);
    }
  });
});
