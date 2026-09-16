import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  AsaasIntegrationNotVerifiedException,
  AsaasWebhookSignatureInvalidException,
} from '../../domain/exceptions/asaas.exceptions';
import { AsaasWebhookSignatureVerifier } from '../../domain/services/asaas-webhook-signature.verifier';

/**
 * IP-009 — CONTRATO/ESQUELETO do receptor de webhook do Asaas.
 *
 * NÃO está registrado em `payment.module.ts` (nenhuma rota fica exposta pela
 * aplicação em execução hoje). Existe para provar o formato do contrato
 * (rota, verificação de assinatura antes de qualquer processamento,
 * rejeição fail-closed) e ser testável diretamente — ver
 * `asaas-webhook.controller.spec.ts`, que instancia esta classe sem DI/Nest
 * bootstrap.
 *
 * Quando uma IP futura tiver credencial + esquema de assinatura confirmados,
 * o trabalho é: (1) trocar `UnverifiedAsaasWebhookSignatureVerifier` por uma
 * implementação real do mesmo port; (2) implementar o parsing/dispatch de
 * evento que hoje lança `AsaasIntegrationNotVerifiedException`; (3) registrar
 * esta classe em `payment.module.ts` e documentar a rota em
 * `docs/openapi.yaml`. Nenhuma mudança de shape é esperada além disso.
 */
@Controller('webhooks/asaas')
export class AsaasWebhookController {
  constructor(
    private readonly verifier: AsaasWebhookSignatureVerifier,
    private readonly logger?: PinoLogger,
  ) {
    this.logger?.setContext(AsaasWebhookController.name);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  receive(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<never> {
    // Nota: idealmente a verificação usa os BYTES crus do corpo (raw body),
    // não o JSON já parseado/reserializado — o parsing pode não preservar
    // ordem/whitespace exigido por um esquema de assinatura real. O plugin
    // de raw body do Fastify não está configurado para esta rota ainda,
    // porque nenhum esquema real foi confirmado que precise dele. Registrar
    // isso explicitamente em vez de fingir que `JSON.stringify` é equivalente.
    const rawBody = JSON.stringify(body ?? {});

    const verified = this.verifier.verify(rawBody, headers);
    if (!verified) {
      this.logger?.warn(
        { operation: 'asaas.webhook.receive', result: 'REJECTED' },
        'Asaas webhook rejected: signature/token not verified (stub is fail-closed).',
      );
      return Promise.reject(new AsaasWebhookSignatureInvalidException());
    }

    // Não alcançável hoje: o verificador ativo sempre devolve `false`. Uma
    // vez substituído por uma implementação real, o próximo passo é
    // implementar o parsing do evento — deliberadamente não feito aqui para
    // não inventar o shape do payload de evento do Asaas sem confirmação.
    return Promise.reject(new AsaasIntegrationNotVerifiedException('webhook.receive'));
  }
}
