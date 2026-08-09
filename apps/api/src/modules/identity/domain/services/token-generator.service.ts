export interface GeneratedToken {
  /** Token em claro — vai apenas no link do e-mail, nunca no banco ou em logs. */
  token: string;
  /** SHA-256 hex do token — é o que se persiste e se consulta. */
  tokenHash: string;
}

export abstract class TokenGeneratorService {
  abstract generate(): GeneratedToken;
  abstract hash(token: string): string;
}
