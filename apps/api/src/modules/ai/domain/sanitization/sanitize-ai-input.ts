/**
 * IP-019 — minimização de dados antes de qualquer payload de prompt.
 *
 * Lógica pura, sem I/O, testável sem LLM real — esta função É a cobertura de
 * "prompt-injection/data-leak" exigida pelo critério de aceite desta IP no
 * escopo atual (nenhuma chamada real de LLM existe — ver
 * `ai-assistance.exceptions.ts`). Ela roda ANTES de qualquer template ser
 * preenchido (`prompt-templates.ts`), então mesmo quando um provedor real for
 * ligado no futuro, nenhum campo proibido chega a compor um prompt.
 *
 * Campos removidos (02_SHARED_ENGINEERING_STANDARDS §7 — privacidade):
 * - localização precisa/GPS (latitude/longitude, endereço completo);
 * - dado de contato de terceiro (e-mail, telefone);
 * - dado de pagamento (qualquer token/número/id de método de pagamento);
 * - qualquer campo cujo nome combine com um padrão sensível conhecido, para
 *   cobrir objetos que a chamada não previu explicitamente (fail-closed por
 *   nome de campo, não só por allowlist de forma).
 */
const SENSITIVE_KEY_PATTERN =
  /(lat|lon|lng|latitude|longitude|gps|geo|coordinate|address|street|zipcode|zip_code|postal|email|e_mail|phone|telefone|celular|whatsapp|cpf|cnpj|card|cartao|payment|pagamento|token|password|senha|secret|cvv|iban|account_number)/i;

const ALLOWED_STRING_MAX_LENGTH = 4000;

export type SanitizableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SanitizableValue[]
  | { [key: string]: SanitizableValue };

/**
 * Remove recursivamente qualquer campo cujo nome combine com o padrão
 * sensível, e trunca strings longas (mitigação adicional de prompt-injection
 * por payload excessivo). Retorna um novo objeto — nunca muta a entrada.
 */
export function sanitizeAiInput<T extends SanitizableValue>(value: T): T {
  return sanitizeValue(value) as T;
}

function sanitizeValue(value: SanitizableValue): SanitizableValue {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeValue);

  const result: Record<string, SanitizableValue> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    result[key] = sanitizeValue(fieldValue);
  }
  return result;
}

function truncate(text: string): string {
  return text.length > ALLOWED_STRING_MAX_LENGTH
    ? `${text.slice(0, ALLOWED_STRING_MAX_LENGTH)}…`
    : text;
}
