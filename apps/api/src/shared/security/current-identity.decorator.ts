import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedIdentity } from './authenticated-identity';

/**
 * Injeta a Identity autenticada no handler:
 * `@CurrentIdentity() identity: AuthenticatedIdentity`
 */
export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedIdentity => {
    const request = context
      .switchToHttp()
      .getRequest<{ identity?: AuthenticatedIdentity }>();
    if (!request.identity) {
      throw new Error(
        'CurrentIdentity used on a route without JwtAuthGuard — this is a programming error.',
      );
    }
    return request.identity;
  },
);
