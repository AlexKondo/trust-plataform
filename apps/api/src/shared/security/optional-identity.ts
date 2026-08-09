import { FastifyRequest } from 'fastify';
import { JwtTokenService } from './jwt-token.service';

/**
 * Identidade do chamador em rotas @Public() que se comportam de forma diferente
 * para visitante e usuário logado (ex.: MRK-005 — o dono vê o próprio rascunho).
 * Token ausente ou inválido = visitante anônimo: nunca lança 401 aqui.
 */
export function resolveOptionalIdentity(
  request: FastifyRequest,
  jwtTokenService: JwtTokenService,
): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  try {
    return jwtTokenService.verifyAccessToken(token).sub;
  } catch {
    return null;
  }
}
