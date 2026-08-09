import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import {
  EmailService,
  PasswordResetEmailInput,
  VerificationEmailInput,
} from '../../domain/services/email.service';

const BREVO_SEND_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Envio via API REST do Brevo (P6b). Requer chave de API REST (prefixo `xkeysib-`,
 * gerada em SMTP & API → API Keys) — a chave SMTP (`xsmtpsib-`) não funciona aqui.
 */
@Injectable()
export class BrevoEmailService extends EmailService {
  constructor(
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(BrevoEmailService.name);
  }

  async sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
    await this.send({
      operation: 'SendVerificationEmail',
      to: input.to,
      toName: input.fullName,
      subject: 'Confirme seu e-mail — Trust Platform',
      htmlContent: this.buildVerificationHtml(input),
    });
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
    await this.send({
      operation: 'SendPasswordResetEmail',
      to: input.to,
      toName: input.fullName,
      subject: 'Redefinição de senha — Trust Platform',
      htmlContent: this.buildPasswordResetHtml(input),
    });
  }

  private async send(input: {
    operation: string;
    to: string;
    toName: string;
    subject: string;
    htmlContent: string;
  }): Promise<void> {
    const response = await fetch(BREVO_SEND_EMAIL_URL, {
      method: 'POST',
      headers: {
        'api-key': this.config.brevoApiKey ?? '',
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Trust Platform', email: this.config.emailFrom },
        to: [{ email: input.to, name: input.toName }],
        subject: input.subject,
        htmlContent: input.htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      // Nunca logar o token/URL completa — só o status e o começo da resposta
      this.logger.error(
        {
          operation: input.operation,
          statusCode: response.status,
          providerResponse: body.slice(0, 300),
          result: 'FAILURE',
        },
        'Brevo rejected the transactional email.',
      );
      throw new Error(`Brevo send failed with status ${response.status}`);
    }

    this.logger.info({ operation: input.operation, result: 'SUCCESS' }, 'Email sent via Brevo.');
  }

  private buildPasswordResetHtml(input: PasswordResetEmailInput): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Redefinição de senha</h2>
        <p>Olá, ${escapeHtml(input.fullName)}. Recebemos um pedido para redefinir sua senha.
           O link abaixo vale por 30 minutos.</p>
        <p style="margin: 24px 0;">
          <a href="${input.resetUrl}"
             style="background: #111; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Redefinir senha
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">
          Se você não pediu a redefinição, ignore este e-mail — sua senha continua a mesma.
        </p>
      </div>`;
  }

  private buildVerificationHtml(input: VerificationEmailInput): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Bem-vindo(a) à Trust Platform, ${escapeHtml(input.fullName)}!</h2>
        <p>Confirme seu endereço de e-mail para ativar sua conta. O link vale por 24 horas.</p>
        <p style="margin: 24px 0;">
          <a href="${input.verificationUrl}"
             style="background: #111; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Confirmar e-mail
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">
          Se você não criou esta conta, ignore este e-mail.
        </p>
      </div>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
