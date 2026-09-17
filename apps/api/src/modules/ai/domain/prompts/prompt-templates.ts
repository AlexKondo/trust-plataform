/**
 * IP-019 — registro versionado de templates de prompt.
 *
 * Regras deste registro:
 * 1. Cada entrada tem `version` explícita — nunca editar um template no
 *    lugar; uma mudança de conteúdo é uma nova versão (`v2`, `v3`, ...) para
 *    que auditoria (`ai_suggestion_audit` via `audit_logs`) sempre saiba
 *    exatamente qual texto gerou qual sugestão.
 * 2. `Object.freeze` em cada entrada e no registro inteiro — o registro é
 *    imutável em runtime (testado em `prompt-templates.spec.ts`).
 * 3. Regras de produto determinísticas (categoria válida, faixa de
 *    orçamento, transições de estado) NUNCA vivem aqui nem em qualquer texto
 *    de prompt — continuam nos use cases/entidades de domínio existentes
 *    (`04_APPROVED_PRODUCT_DECISIONS`). O LLM só ajuda a redigir/sugerir
 *    texto; nunca decide uma regra de negócio.
 * 4. Todo template deixa explícito para o próprio modelo que a saída é
 *    consultiva e que dados sensíveis (localização precisa, contato de
 *    terceiros, dados de pagamento) já foram removidos antes de chegar aqui
 *    (ver `sanitize-ai-input.ts`) — isto é também a mitigação primária de
 *    prompt-injection para o escopo desta IP (sem chamada real de LLM).
 */
export interface PromptTemplate {
  readonly version: string;
  readonly template: string;
}

export const PROMPT_TEMPLATES = Object.freeze({
  structureServiceRequest: Object.freeze({
    version: 'v1',
    template:
      'You are assisting a Trust Platform Member to structure a local-service request from free text. ' +
      'The input has already been sanitized (no precise location, no third-party contact, no payment data). ' +
      'Suggest a title, a clear description, an optional category and an optional urgency. ' +
      'Your output is advisory only — it never creates or submits the request. Free text: {{freeText}}',
  }),
  suggestClarifyingQuestions: Object.freeze({
    version: 'v1',
    template:
      'You are assisting a Trust Platform Member. Given the sanitized title and description below, ' +
      'suggest up to 5 short clarifying questions that would help a Partner quote accurately. ' +
      'Your output is advisory only. Title: {{title}} Description: {{description}}',
  }),
  assistQuoteDescription: Object.freeze({
    version: 'v1',
    template:
      'You are assisting a Trust Platform Partner writing a quote (Offer) description for the sanitized ' +
      'category and draft below. Improve clarity and professionalism without inventing price, scope or ' +
      'promises the Partner did not state. Your output is advisory only, never auto-submitted. ' +
      'Category: {{serviceCategory}} Draft: {{draftDescription}}',
  }),
  explainComparisonFactors: Object.freeze({
    version: 'v1',
    template:
      'You are explaining, in plain language, the deterministic comparison factors already computed by the ' +
      'Trust Platform product rules (never recompute or contradict them) for the sanitized factor list below. ' +
      'Your output is advisory only. Factors: {{factors}}',
  }),
} as const);

export type PromptTemplateKey = keyof typeof PROMPT_TEMPLATES;

/** Interpolação simples e determinística `{{campo}}` — nenhuma lógica de negócio aqui. */
export function renderPromptTemplate(
  key: PromptTemplateKey,
  variables: Record<string, string>,
): { version: string; text: string } {
  const entry = PROMPT_TEMPLATES[key];
  const text = Object.entries(variables).reduce(
    (acc, [name, value]) => acc.replaceAll(`{{${name}}}`, value),
    entry.template,
  );
  return { version: entry.version, text };
}
