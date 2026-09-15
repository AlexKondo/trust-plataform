import { BusinessRuleViolationException } from '../../../../shared/domain/exceptions/domain.exception';

/**
 * IP-002 — defesa em profundidade: o DTO (zod) já rejeita valores fora de
 * `SUPPORTED_LOCALES` na borda da API, mas a Entity nunca deve confiar
 * cegamente no chamador (Clean Architecture — invariante pertence ao domínio).
 */
export class UnsupportedLocaleException extends BusinessRuleViolationException {
  readonly code = 'UNSUPPORTED_LOCALE';

  constructor(locale: string) {
    super(`Locale "${locale}" is not supported.`);
  }
}
