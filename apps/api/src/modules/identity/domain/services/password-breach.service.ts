/**
 * Checagem de senha contra vazamentos conhecidos (DOC-002: senhas fortes).
 * Implementação em infrastructure/security (HIBP k-anonymity) — a senha
 * completa NUNCA sai do processo.
 */
export abstract class PasswordBreachService {
  abstract isBreached(password: string): Promise<boolean>;
}
