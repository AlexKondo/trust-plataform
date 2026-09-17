/**
 * IP-019 — PORT de assistência por IA (AI Assistance Layer).
 *
 * O domínio/aplicação conhece SÓ esta interface — nunca um SDK de provedor de
 * LLM (OpenAI/Anthropic/etc.), nem um shape de payload específico de provedor.
 * Modelado sobre a mesma convenção de `PaymentGateway`
 * (`apps/api/src/modules/payment/domain/services/payment-gateway.ts`) e
 * `EtaEstimatorPort`
 * (`apps/api/src/modules/marketplace/domain/ports/eta-estimator.port.ts`):
 * trocar de provedor (ou de "nenhum provedor configurado" para um real) é
 * escrever um adapter novo atrás deste port; nenhum use case ou controller
 * muda.
 *
 * Toda sugestão é SEMPRE consultiva/opcional (04_APPROVED_PRODUCT_DECISIONS —
 * IP-019 fora de escopo: nenhuma ação autônoma). Nenhum método deste port
 * cria, altera ou submete um agregado de domínio; cada um apenas devolve
 * texto/estrutura sugerida para o caller decidir o que fazer com ela.
 */
export abstract class AiAssistancePort {
  /** Identificador estável do provedor — ex.: `not-configured`, `openai`, `anthropic`. */
  abstract readonly providerId: string;

  /** Ajuda o Member a estruturar um pedido de serviço a partir de texto livre. */
  abstract structureServiceRequest(
    input: StructureServiceRequestInput,
  ): Promise<AiSuggestionResult<StructuredServiceRequestSuggestion>>;

  /** Sugere perguntas de esclarecimento para reduzir ambiguidade do pedido. */
  abstract suggestClarifyingQuestions(
    input: SuggestClarifyingQuestionsInput,
  ): Promise<AiSuggestionResult<ClarifyingQuestionsSuggestion>>;

  /** Ajuda o Partner a redigir/melhorar a descrição de uma cotação (Offer). */
  abstract assistQuoteDescription(
    input: AssistQuoteDescriptionInput,
  ): Promise<AiSuggestionResult<QuoteDescriptionSuggestion>>;

  /** Explica em linguagem simples os fatores do mapa de comparação (IP-004). */
  abstract explainComparisonFactors(
    input: ExplainComparisonFactorsInput,
  ): Promise<AiSuggestionResult<ComparisonExplanationSuggestion>>;
}

/** Todo método do port devolve o mesmo envelope — sucesso opcional + motivo quando ausente. */
export interface AiSuggestionResult<T> {
  /** `null` sempre que nenhuma sugestão foi gerada (desabilitado, não configurado, timeout, erro). */
  suggestion: T | null;
  /** Presente sempre que `suggestion` é `null` — nunca falha silenciosa sem motivo. */
  unavailableReason: AiUnavailableReason | null;
  /** Template/versão de prompt usado — auditoria (ver `prompt-templates.ts`). Nulo se não gerado. */
  promptVersion: string | null;
  /** Sempre `true`: reforça em compile-time/runtime que isto é conselho, nunca uma ação executada. */
  readonly advisory: true;
}

export type AiUnavailableReason =
  | 'AI_DISABLED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR';

export interface StructureServiceRequestInput {
  memberId: string;
  freeText: string;
  locale: string;
}

export interface StructuredServiceRequestSuggestion {
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedCategory: string | null;
  suggestedUrgency: 'LOW' | 'MEDIUM' | 'HIGH' | null;
}

export interface SuggestClarifyingQuestionsInput {
  memberId: string;
  title: string;
  description: string;
  locale: string;
}

export interface ClarifyingQuestionsSuggestion {
  questions: string[];
}

export interface AssistQuoteDescriptionInput {
  partnerId: string;
  draftDescription: string;
  serviceCategory: string;
  locale: string;
}

export interface QuoteDescriptionSuggestion {
  suggestedDescription: string;
}

export interface ExplainComparisonFactorsInput {
  requesterId: string;
  factors: Array<{ label: string; value: string }>;
  locale: string;
}

export interface ComparisonExplanationSuggestion {
  explanation: string;
}
