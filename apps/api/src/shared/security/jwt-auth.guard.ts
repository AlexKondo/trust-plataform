import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtTokenService } from './jwt-token.service';
import { AuthenticatedIdentity } from './authenticated-identity';

/**
 * Guard global: toda rota exige Bearer token válido, exceto @Public().
 * Token inválido/expirado → 401 (INCONSISTENCIAS #23). Mensagem opaca — nunca
 * revelar se o problema foi assinatura, expiração ou formato.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { identity?: AuthenticatedIdentity }>();

    const token = this.extractBearerToken(request);
    if (!token) {
      throw this.unauthorized();
    }

    try {
      const payload = this.jwtTokenService.verifyAccessToken(token);
      request.identity = { identityId: payload.sub, tokenId: payload.jti };
      return true;
    } catch {
      throw this.unauthorized();
    }
  }

  private extractBearerToken(request: FastifyRequest): string | undefined {
    const header = request.headers.authorization;
    if (!header) {
      return undefined;
    }
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_TOKEN',
      message: 'Invalid or expired access token.',
    });
  }
}
