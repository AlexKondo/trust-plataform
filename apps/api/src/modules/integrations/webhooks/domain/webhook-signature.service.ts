import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * IP-023 — assinatura HMAC-SHA256 de webhooks OUTBOUND.
 *
 * `X-Trust-Webhook-Signature` = hex(HMAC-SHA256(secret, rawBody)). O
 * parceiro recalcula sobre o corpo bruto recebido e compara — por isso a
 * assinatura é calculada aqui a partir da STRING JSON já serializada (nunca
 * do objeto), igual à recomendação padrão de mercado (Stripe/GitHub) e ao
 * mesmo espírito do verificador INBOUND do IP-009 (comparação
 * `timingSafeEqual`, nunca `===`).
 */
@Injectable()
export class WebhookSignatureService {
  sign(rawBody: string, secret: string): string {
    return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  }

  /** Comparação resistente a timing attack — mesmo padrão do IP-009. */
  verify(rawBody: string, secret: string, signatureHex: string): boolean {
    const expected = this.sign(rawBody, secret);
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(signatureHex, 'hex');
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, actualBuf);
  }
}
