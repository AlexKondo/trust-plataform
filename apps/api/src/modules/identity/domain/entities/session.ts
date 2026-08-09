import { v7 as uuidv7 } from 'uuid';

interface SessionProps {
  id: string;
  identityId: string;
  /** SHA-256 do refresh token — o token em claro nunca é persistido (P7/DOC-002). */
  refreshTokenHash: string;
  /** jti do access token emitido para esta sessão. */
  accessTokenId: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastAccessAt: Date;
  revokedAt: Date | null;
}

interface CreateNewSessionInput {
  identityId: string;
  refreshTokenHash: string;
  accessTokenId: string;
  ipAddress?: string;
  userAgent?: string;
  ttlDays: number;
}

/** Sessão autenticada (IDN-003). Exceção documentada: usa revoked_at, não deleted_at. */
export class Session {
  private constructor(private readonly props: SessionProps) {}

  static createNew(input: CreateNewSessionInput): Session {
    const now = new Date();
    return new Session({
      id: uuidv7(),
      identityId: input.identityId,
      refreshTokenHash: input.refreshTokenHash,
      accessTokenId: input.accessTokenId,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + input.ttlDays * 24 * 60 * 60 * 1000),
      lastAccessAt: now,
      revokedAt: null,
    });
  }

  static restore(props: SessionProps): Session {
    return new Session(props);
  }

  get id(): string {
    return this.props.id;
  }

  get identityId(): string {
    return this.props.identityId;
  }

  get refreshTokenHash(): string {
    return this.props.refreshTokenHash;
  }

  get accessTokenId(): string {
    return this.props.accessTokenId;
  }

  get ipAddress(): string | null {
    return this.props.ipAddress;
  }

  get userAgent(): string | null {
    return this.props.userAgent;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get lastAccessAt(): Date {
    return this.props.lastAccessAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  isActive(now = new Date()): boolean {
    return !this.props.revokedAt && now.getTime() < this.props.expiresAt.getTime();
  }

  revoke(now = new Date()): void {
    this.props.revokedAt = now;
  }

  touch(now = new Date()): void {
    this.props.lastAccessAt = now;
  }

  /** Rotação de refresh token (IDN-004): o hash antigo deixa de valer. */
  rotate(refreshTokenHash: string, accessTokenId: string, now = new Date()): void {
    this.props.refreshTokenHash = refreshTokenHash;
    this.props.accessTokenId = accessTokenId;
    this.props.lastAccessAt = now;
  }
}
