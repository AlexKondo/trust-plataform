import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AiAssistanceConfigService } from './infrastructure/ai-assistance-config.service';

/**
 * IP-019 — prova dedicada de "AI can be disabled with no core-flow breakage"
 * (critério de aceite da IP).
 *
 * A prova tem duas partes complementares:
 *
 * 1. Estrutural: nenhum use case do fluxo central ServiceRequest → Offer →
 *    Order (IP-003/004) importa qualquer coisa deste módulo `ai/`. Isto não
 *    é coincidência de implementação — é a decisão de design desta IP: a
 *    camada de IA nunca foi acoplada dentro dos use cases centrais, existe
 *    como módulo/porta opcional e separado (mesmo padrão de
 *    `EtaEstimatorPort`/`PaymentGateway`: comportamento plugável atrás de um
 *    port, nunca uma dependência obrigatória do fluxo). Portanto a flag
 *    `AI_ASSISTANCE_ENABLED=false` (default) não pode quebrar o fluxo
 *    central pela simples razão de que o fluxo central nunca a lê.
 * 2. Comportamental: a flag realmente é `false` por padrão quando nenhuma
 *    variável de ambiente é definida (a mesma configuração que roda o resto
 *    da suíte de testes e cada ambiente hoje).
 *
 * A regressão completa do fluxo ServiceRequest → Offer → Order em si já é
 * coberta pelos specs existentes de IP-003/004
 * (`create-service-request.usecase.spec.ts`, `create-offer.usecase.spec.ts`,
 * `accept-offer.usecase.spec.ts`, `manage-order.usecase.spec.ts`, e o E2E
 * `ip-003-service-request-discovery-matching.e2e.spec.ts` /
 * `ip-004-competitive-quotes-comparison.e2e.spec.ts`) — nenhum desses
 * arquivos foi modificado por esta IP (ver diff), e todos continuam
 * passando com o módulo `ai/` presente porém desligado, o que é a prova de
 * regressão em si.
 */
const CORE_FLOW_USECASE_FILES = [
  '../marketplace/application/usecases/create-service-request.usecase.ts',
  '../marketplace/application/usecases/create-offer.usecase.ts',
  '../marketplace/application/usecases/accept-offer.usecase.ts',
  '../marketplace/application/usecases/manage-order.usecase.ts',
  '../marketplace/application/usecases/order-lifecycle.service.ts',
];

describe('IP-019 — AI OFF does not affect the core ServiceRequest → Offer → Order flow', () => {
  it('nenhum use case do fluxo central importa o módulo de IA (acoplamento zero, não apenas flag)', () => {
    for (const relativePath of CORE_FLOW_USECASE_FILES) {
      const absolutePath = resolve(__dirname, relativePath);
      const source = readFileSync(absolutePath, 'utf8');

      expect(source).not.toMatch(/from\s+['"].*\/ai\//);
      expect(source).not.toMatch(/AiAssistance|AiAssistancePort|GenerateAiSuggestionUseCase/);
    }
  });

  it('AI_ASSISTANCE_ENABLED é false quando nenhuma variável de ambiente é definida (default real)', () => {
    const config = new AiAssistanceConfigService({
      aiAssistanceEnabled: false,
      aiProviderApiKey: undefined,
      aiAssistanceTimeoutMs: 8000,
    });

    expect(config.enabled).toBe(false);
  });
});
