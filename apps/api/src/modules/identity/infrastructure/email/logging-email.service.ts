import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { EmailService, VerificationEmailInput } from '../../domain/services/email.service';

/**
 * Fallback de desenvolvimento/teste: em vez de enviar, registra o link de
 * verificação no log. Ativado quando não há chave REST do Brevo (`xkeysib-`).
 * `lastSent` existe para os testes e2e capturarem o link.
 */
@Injectable()
export class LoggingEmailService extends EmailService {
  lastSent: VerificationEmailInput | null = null;

  constructor(private readonly logger: PinoLogger) {
    super();
    this.logger.setContext(LoggingEmailService.name);
  }

  async sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
    this.lastSent = input;
    this.logger.warn(
      {
        operation: 'SendVerificationEmail',
        to: maskEmail(input.to),
        verificationUrl: input.verificationUrl,
        result: 'SKIPPED_NO_PROVIDER',
      },
      'E-mail NÃO enviado (sem chave REST do Brevo) — use o link do campo verificationUrl.',
    );
    return Promise.resolve();
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local?.[0] ?? ''}***@${domain ?? ''}`;
}
