import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.schema';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get apiPort(): number {
    return this.config.get('PORT', { infer: true }) ?? this.config.get('API_PORT', { infer: true });
  }

  get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get dbPoolMax(): number {
    return this.config.get('DB_POOL_MAX', { infer: true });
  }

  get jwtPrivateKeyPem(): string {
    return Buffer.from(this.config.get('JWT_PRIVATE_KEY', { infer: true }), 'base64').toString(
      'utf8',
    );
  }

  get jwtPublicKeyPem(): string {
    return Buffer.from(this.config.get('JWT_PUBLIC_KEY', { infer: true }), 'base64').toString(
      'utf8',
    );
  }

  get accessTokenTtlSeconds(): number {
    return this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
  }

  get refreshTokenTtlDays(): number {
    return this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
  }

  get outboxPollIntervalMs(): number {
    return this.config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true });
  }

  get outboxBatchSize(): number {
    return this.config.get('OUTBOX_BATCH_SIZE', { infer: true });
  }

  get outboxMaxAttempts(): number {
    return this.config.get('OUTBOX_MAX_ATTEMPTS', { infer: true });
  }

  get loginMaxFailedAttempts(): number {
    return this.config.get('LOGIN_MAX_FAILED_ATTEMPTS', { infer: true });
  }

  get loginLockoutMinutes(): number {
    return this.config.get('LOGIN_LOCKOUT_MINUTES', { infer: true });
  }

  get rateLimitMaxPerMinute(): number {
    return this.config.get('RATE_LIMIT_MAX_PER_MINUTE', { infer: true });
  }

  get evidenceMaxFileBytes(): number {
    return this.config.get('EVIDENCE_MAX_FILE_MB', { infer: true }) * 1024 * 1024;
  }

  get sensitiveActionRateLimitMaxAttempts(): number {
    return this.config.get('SENSITIVE_ACTION_RATE_LIMIT_MAX_ATTEMPTS', { infer: true });
  }

  get sensitiveActionRateLimitWindowMinutes(): number {
    return this.config.get('SENSITIVE_ACTION_RATE_LIMIT_WINDOW_MINUTES', { infer: true });
  }

  get changeOrderSuspiciousCountThreshold(): number {
    return this.config.get('CHANGE_ORDER_SUSPICIOUS_COUNT_THRESHOLD', { infer: true });
  }

  get changeOrderSuspiciousAmountRatioBps(): number {
    return this.config.get('CHANGE_ORDER_SUSPICIOUS_AMOUNT_RATIO_BPS', { infer: true });
  }

  get supabaseUrl(): string | undefined {
    return this.config.get('SUPABASE_URL', { infer: true });
  }

  get supabaseServiceRoleKey(): string | undefined {
    return this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true });
  }

  get brevoApiKey(): string | undefined {
    return this.config.get('BREVO_API_KEY', { infer: true });
  }

  get emailFrom(): string {
    return this.config.get('EMAIL_FROM', { infer: true });
  }

  get appBaseUrl(): string {
    return this.config.get('APP_BASE_URL', { infer: true });
  }

  get emailVerificationTtlHours(): number {
    return this.config.get('EMAIL_VERIFICATION_TTL_HOURS', { infer: true });
  }

  get passwordResetTtlMinutes(): number {
    return this.config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
  }

  get passwordBreachCheckEnabled(): boolean {
    return this.config.get('PASSWORD_BREACH_CHECK_ENABLED', { infer: true });
  }

  /** IP-009 — nunca configurada em nenhum ambiente até uma conta Asaas real existir. */
  get asaasApiKey(): string | undefined {
    return this.config.get('ASAAS_API_KEY', { infer: true });
  }

  get asaasEnvironment(): Env['ASAAS_ENVIRONMENT'] {
    return this.config.get('ASAAS_ENVIRONMENT', { infer: true });
  }

  get asaasWebhookToken(): string | undefined {
    return this.config.get('ASAAS_WEBHOOK_TOKEN', { infer: true });
  }

  /** IP-019 — feature flag da camada de assistência por IA. Default `false`. */
  get aiAssistanceEnabled(): boolean {
    return this.config.get('AI_ASSISTANCE_ENABLED', { infer: true });
  }

  /** IP-019 — nunca configurada em nenhum ambiente até um provedor real ser contratado. */
  get aiProviderApiKey(): string | undefined {
    return this.config.get('AI_PROVIDER_API_KEY', { infer: true });
  }

  get aiAssistanceTimeoutMs(): number {
    return this.config.get('AI_ASSISTANCE_TIMEOUT_MS', { infer: true });
  }
}
