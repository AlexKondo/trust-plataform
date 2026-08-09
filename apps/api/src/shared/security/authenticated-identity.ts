export interface AuthenticatedIdentity {
  identityId: string;
  /** JWT ID do access token — útil para auditoria e revogação. */
  tokenId: string;
}

export interface AccessTokenPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
}
