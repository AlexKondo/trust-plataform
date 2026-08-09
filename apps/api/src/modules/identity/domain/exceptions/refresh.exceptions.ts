import { DomainException } from '../../../../shared/domain/exceptions/domain.exception';

/**
 * BR-001/007 do IDN-004: refresh token desconhecido, expirado ou de sessão
 * revogada → 401. Mensagens opacas — não revelar qual foi o problema além
 * do necessário para o cliente redirecionar ao login.
 */
export class InvalidRefreshTokenException extends DomainException {
  readonly code = 'INVALID_REFRESH_TOKEN';
  override readonly httpStatus = 401;

  constructor() {
    super('Invalid refresh token.');
  }
}

export class ExpiredRefreshTokenException extends DomainException {
  readonly code = 'EXPIRED_REFRESH_TOKEN';
  override readonly httpStatus = 401;

  constructor() {
    super('Refresh token has expired.');
  }
}

export class RevokedSessionException extends DomainException {
  readonly code = 'SESSION_REVOKED';
  override readonly httpStatus = 401;

  constructor() {
    super('Session has been revoked.');
  }
}
