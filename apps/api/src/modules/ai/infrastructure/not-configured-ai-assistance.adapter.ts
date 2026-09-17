import { Injectable } from '@nestjs/common';
import { AiAssistanceNotConfiguredException } from '../domain/exceptions/ai-assistance.exceptions';
import {
  AiAssistancePort,
  AiSuggestionResult,
  AssistQuoteDescriptionInput,
  ClarifyingQuestionsSuggestion,
  ComparisonExplanationSuggestion,
  ExplainComparisonFactorsInput,
  QuoteDescriptionSuggestion,
  StructureServiceRequestInput,
  StructuredServiceRequestSuggestion,
  SuggestClarifyingQuestionsInput,
} from '../domain/ports/ai-assistance.port';

/**
 * IP-019 — implementação Release-1 do `AiAssistancePort`: espelha
 * deliberadamente o papel do `AsaasNotConfiguredException`/adapter-esqueleto
 * do IP-009. Nenhum provedor real de LLM está configurado em nenhum
 * ambiente hoje (nenhuma `AI_PROVIDER_API_KEY` — ver `.env.example`), então
 * este adapter NUNCA tenta uma chamada HTTP de saída: toda operação devolve
 * uma promise rejeitada com `AiAssistanceNotConfiguredException`, de forma
 * honesta e imediata (sem I/O).
 *
 * Trocar por um provedor real no futuro é registrar outra classe atrás deste
 * mesmo `AiAssistancePort` em `ai.module.ts` — nenhum use case, controller ou
 * entidade muda (mesma convenção do `DeclaredEtaAdapter`/`EtaEstimatorPort`).
 */
@Injectable()
export class NotConfiguredAiAssistanceAdapter extends AiAssistancePort {
  readonly providerId = 'not-configured';

  structureServiceRequest(
    _input: StructureServiceRequestInput,
  ): Promise<AiSuggestionResult<StructuredServiceRequestSuggestion>> {
    return Promise.reject(new AiAssistanceNotConfiguredException('structureServiceRequest'));
  }

  suggestClarifyingQuestions(
    _input: SuggestClarifyingQuestionsInput,
  ): Promise<AiSuggestionResult<ClarifyingQuestionsSuggestion>> {
    return Promise.reject(new AiAssistanceNotConfiguredException('suggestClarifyingQuestions'));
  }

  assistQuoteDescription(
    _input: AssistQuoteDescriptionInput,
  ): Promise<AiSuggestionResult<QuoteDescriptionSuggestion>> {
    return Promise.reject(new AiAssistanceNotConfiguredException('assistQuoteDescription'));
  }

  explainComparisonFactors(
    _input: ExplainComparisonFactorsInput,
  ): Promise<AiSuggestionResult<ComparisonExplanationSuggestion>> {
    return Promise.reject(new AiAssistanceNotConfiguredException('explainComparisonFactors'));
  }
}
