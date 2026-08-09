import { v7 as uuidv7 } from 'uuid';

interface PasswordResetTokenProps {
  id: string;
  identityId: string;
  /** SHA-256 do token — o token em claro nunca é persistido (DOC-002). */
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
}

interface CreateNewResetTokenInput {
  identityId: string;
  tokenHash: string;
  ttlMinutes: number;
}

/** Token de recuperação de senha (IDN-007/008). Validade de 30 min (BR-004). */
export class PasswordResetToken {
  private constructor(private readonly props: PasswordResetTokenProps) {}

  static createNew(input: CreateNewResetTokenInput): PasswordResetToken {
    const now = new Date();
    return new PasswordResetToken({
      id: uuidv7(),
      identityId: input.identityId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(now.getTime() + input.ttlMinutes * 60 * 1000),
      usedAt: null,
      invalidatedAt: null,
      createdAt: now,
    });
  }

  static restore(props: PasswordResetTokenProps): PasswordResetToken {
    return new PasswordResetToken(props);
  }

  get id(): string {
    return this.props.id;
  }

  get identityId(): string {
    return this.props.identityId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get usedAt(): Date | null {
    return this.props.usedAt;
  }

  get invalidatedAt(): Date | null {
    return this.props.invalidatedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  isExpired(now = new Date()): boolean {
    return now.getTime() > this.props.expiresAt.getTime();
  }

  /** BR-003 do IDN-008: uso único. */
  markUsed(now = new Date()): void {
    this.props.usedAt = now;
  }
}
