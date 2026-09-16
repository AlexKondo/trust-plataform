/**
 * PORT de verificação de assinatura/token de webhook do Asaas (IP-009).
 *
 * O domínio nunca decide SE um payload de webhook é autêntico lendo o corpo
 * diretamente — isso passa sempre por este port, para que trocar o esquema de
 * verificação (quando confirmado contra a documentação real do Asaas) seja
 * escrever um novo adapter, não reabrir o controller.
 *
 * IMPORTANTE: o esquema real de autenticação de webhook do Asaas (nome do
 * header, se é um token estático configurado no painel ou uma assinatura
 * HMAC, o corpo exato sobre o qual a assinatura é calculada) NÃO foi
 * confirmado contra documentação oficial nem uma conta real neste programa —
 * ver `IP-009-CONFLICT-ESCALATION-ASAAS-ACCOUNT-CREDENTIALS.md`. A única
 * implementação existente hoje (`UnverifiedAsaasWebhookSignatureVerifier`) é
 * um stub fail-closed deliberado: nunca inventa um esquema plausível.
 */
export abstract class AsaasWebhookSignatureVerifier {
  /**
   * @param rawBody corpo cru da requisição, como recebido (string/Buffer).
   * @param headers headers da requisição HTTP recebida.
   * @returns `true` somente se a autenticidade do payload foi confirmada.
   */
  abstract verify(
    rawBody: string,
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): boolean;
}
