import { describe, expect, it } from 'vitest';
import { PROMPT_TEMPLATES, renderPromptTemplate } from './prompt-templates';

describe('PROMPT_TEMPLATES registry', () => {
  it('tem exatamente as quatro operações do escopo da IP-019, cada uma versionada', () => {
    expect(Object.keys(PROMPT_TEMPLATES).sort()).toEqual(
      [
        'assistQuoteDescription',
        'explainComparisonFactors',
        'structureServiceRequest',
        'suggestClarifyingQuestions',
      ].sort(),
    );
    for (const entry of Object.values(PROMPT_TEMPLATES)) {
      expect(entry.version).toMatch(/^v\d+$/);
      expect(typeof entry.template).toBe('string');
      expect(entry.template.length).toBeGreaterThan(0);
    }
  });

  it('o registro é imutável (frozen) no nível raiz e em cada entrada', () => {
    expect(Object.isFrozen(PROMPT_TEMPLATES)).toBe(true);
    expect(Object.isFrozen(PROMPT_TEMPLATES.structureServiceRequest)).toBe(true);

    expect(() => {
      // @ts-expect-error — mutação intencional para testar congelamento
      PROMPT_TEMPLATES.structureServiceRequest.version = 'v99';
    }).toThrow();
  });
});

describe('renderPromptTemplate', () => {
  it('seleciona o template/versão correto pela chave e interpola variáveis', () => {
    const { version, text } = renderPromptTemplate('structureServiceRequest', {
      freeText: 'minha torneira vaza',
    });

    expect(version).toBe('v1');
    expect(text).toContain('minha torneira vaza');
    expect(text).not.toContain('{{freeText}}');
  });

  it('não altera o template original no registro (imutabilidade preservada após render)', () => {
    const before = PROMPT_TEMPLATES.suggestClarifyingQuestions.template;
    renderPromptTemplate('suggestClarifyingQuestions', { title: 't', description: 'd' });
    expect(PROMPT_TEMPLATES.suggestClarifyingQuestions.template).toBe(before);
  });
});
