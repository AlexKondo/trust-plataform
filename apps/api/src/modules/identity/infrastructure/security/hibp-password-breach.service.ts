import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { PasswordBreachService } from '../../domain/services/password-breach.service';

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

/**
 * Have I Been Pwned via k-anonymity: envia apenas os 5 primeiros caracteres do
 * SHA-1 — a senha (e até o hash completo) nunca saem do processo.
 * Fail-open: se a API estiver fora, NÃO bloqueia o usuário (loga WARN).
 */
@Injectable()
export class HibpPasswordBreachService extends PasswordBreachService {
  constructor(private readonly logger: PinoLogger) {
    super();
    this.logger.setContext(HibpPasswordBreachService.name);
  }

  async isBreached(password: string): Promise<boolean> {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    try {
      const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        throw new Error(`HIBP responded with status ${response.status}`);
      }
      const body = await response.text();
      return body.split('\n').some((line) => {
        const [candidate, count] = line.trim().split(':');
        return candidate === suffix && Number(count) > 0;
      });
    } catch (error) {
      this.logger.warn(
        { err: error, operation: 'PasswordBreachCheck', result: 'SKIPPED' },
        'HIBP unavailable; allowing password without breach check (fail-open).',
      );
      return false;
    }
  }
}
