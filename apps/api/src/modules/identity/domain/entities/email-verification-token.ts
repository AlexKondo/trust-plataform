import { v7 as uuidv7 } from 'uuid';

interface EmailVerificationTokenProps {
  id: string;
  identityId: string;
  /** SHA-256 do token em hex — o token em claro nunca é persistido (DOC-002). */
  tokenHash: string;
  expiresAt: Date;
  verifiedAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
}

interface CreateNewTokenInput {
  identityId: string;
  tokenHash: string;
  ttlHours: number;
}

/** Token de verificação de e-mail (IDN-002, BR-001..004). */
export class EmailVerificationToken {
  private constructor(private readonly props: EmailVerificationTokenProps) {}

  static createNew(input: CreateNewTokenInput): EmailVerificationToken {
    const now = new Date();
    return new EmailVerificationToken({
      id: uuidv7(),
      identityId: input.identityId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(now.getTime() + input.ttlHours * 60 * 60 * 1000),
      verifiedAt: null,
      invalidatedAt: null,
      createdAt: now,
    });
  }

  static restore(props: EmailVerificationTokenProps): EmailVerificationToken {
    return new EmailVerificationToken(props);
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

  get verifiedAt(): Date | null {
    return this.props.verifiedAt;
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

  isUsable(now = new Date()): boolean {
    return !this.props.verifiedAt && !this.props.invalidatedAt && !this.isExpired(now);
  }

  /** BR-003: após a confirmação o token é invalidado (marcado como verificado). */
  markVerified(now = new Date()): void {
    this.props.verifiedAt = now;
  }
}
