/**
 * ÚNICO componente autorizado a gerar/verificar hash de senha (DOC-001/002).
 * Implementação Argon2id em infrastructure/security.
 */
export abstract class PasswordHashService {
  abstract hash(password: string): Promise<string>;
  abstract verify(password: string, hash: string): Promise<boolean>;
}
