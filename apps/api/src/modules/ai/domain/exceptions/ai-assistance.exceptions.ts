import { DomainException } from '../../../../shared/domain/exceptions/domain.exception';

/**
 * IP-019 — exceção do adapter de assistência por IA.
 *
 * Espelha deliberadamente `AsaasNotConfiguredException`
 * (`apps/api/src/modules/payment/domain/exceptions/asaas.exceptions.ts`,
 * IP-009): nenhuma `AI_PROVIDER_API_KEY` existe em nenhum ambiente hoje (ver
 * `.env.example` e IP-019-COMPLETION-REPORT.md), então o adapter real de
 * provedor NUNCA foi implementado — só o esqueleto fail-closed. Inventar uma
 * chamada HTTP para um provedor de LLM sem credencial real e sem verificação
 * de contrato/formato de resposta correria o mesmo risco que o programa já
 * proibiu para o Asaas (`00_READ_FIRST...md` §7): assumir comportamento de
 * fornecedor externo nunca observado.
 *
 * Diferente do Asaas, nenhum use case propaga esta exceção para o caller: o
 * `AiAssistancePort` é sempre chamado através do wrapper de timeout/fallback
 * (`generate-ai-suggestion.usecase.ts`), que a captura e devolve
 * `{ suggestion: null, unavailableReason: 'PROVIDER_NOT_CONFIGURED' }`. A
 * classe existe mesmo assim porque é o sinal preciso, testável e auditável de
 * "por que" nenhuma sugestão saiu — igual ao papel que cumpre no Asaas.
 */
export class AiAssistanceNotConfiguredException extends DomainException {
  readonly code = 'AI_ASSISTANCE_NOT_CONFIGURED';
  override readonly httpStatus = 503;

  constructor(operation: string) {
    super(
      `AI assistance provider is not configured (missing AI_PROVIDER_API_KEY). Operation "${operation}" cannot be executed. This is expected in every environment today — no real LLM provider key exists (see IP-019 Completion Report).`,
    );
  }
}
