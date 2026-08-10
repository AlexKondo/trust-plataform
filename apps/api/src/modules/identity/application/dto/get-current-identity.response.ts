import { IdentityStatus } from '../../domain/entities/identity-status';

/**
 * IDN-005 BR-004..007: apenas dados públicos — nunca senha, hashes,
 * tokens ou campos internos (failed_login_attempts, locked_until etc.).
 */
export interface GetCurrentIdentityResponse {
  identityId: string;
  fullName: string;
  email: string;
  status: IdentityStatus;
  createdAt: string;
  lastLoginAt: string | null;
  /**
   * Permissão administrativa do próprio usuário — não é dado sensível de
   * terceiro e o frontend precisa dela para decidir se mostra o painel admin.
   */
  isAdmin: boolean;
}
