export interface VerificationEmailInput {
  to: string;
  fullName: string;
  verificationUrl: string;
}

/**
 * Envio de e-mail transacional do módulo Identity.
 * Implementações em infrastructure/email (Brevo em produção; logging em dev/teste).
 */
export abstract class EmailService {
  abstract sendVerificationEmail(input: VerificationEmailInput): Promise<void>;
}
