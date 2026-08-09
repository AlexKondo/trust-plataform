import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { IdentityRepository } from '../../domain/repositories/identity.repository';

/**
 * Autorização administrativa mínima do MVP (PLANO §4: "flag admin").
 * Aplicar com @UseGuards(AdminGuard) APÓS o guard global de JWT.
 * A flag vive no banco (is_admin) — nunca no token (DOC-002: autorização
 * sempre no backend, papéis reavaliados a cada requisição).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly identityRepository: IdentityRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ identity?: AuthenticatedIdentity }>();
    const authenticated = request.identity;
    if (!authenticated) {
      throw this.forbidden();
    }
    const identity = await this.identityRepository.findById(authenticated.identityId);
    if (!identity?.isAdmin) {
      throw this.forbidden();
    }
    return true;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'ADMIN_REQUIRED',
      message: 'This operation requires administrative privileges.',
    });
  }
}
