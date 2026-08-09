import { v7 as uuidv7 } from 'uuid';
import { IDENTITY_STATUS, IdentityStatus } from './identity-status';

interface IdentityProps {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  status: IdentityStatus;
  termsAcceptedAt: Date;
  lastLoginAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface CreateNewIdentityInput {
  fullName: string;
  email: string;
  passwordHash: string;
}

/**
 * Identidade digital permanente do usuário (IDN-001 / ID-002).
 * Invariantes: id imutável; email único (garantido pelo repositório/banco);
 * a entity nunca conhece HTTP, banco ou serialização.
 */
export class Identity {
  private constructor(private readonly props: IdentityProps) {}

  static createNew(input: CreateNewIdentityInput): Identity {
    const now = new Date();
    return new Identity({
      id: uuidv7(),
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      status: IDENTITY_STATUS.PENDING_EMAIL_VERIFICATION,
      termsAcceptedAt: now,
      lastLoginAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static restore(props: IdentityProps): Identity {
    return new Identity(props);
  }

  get id(): string {
    return this.props.id;
  }

  get fullName(): string {
    return this.props.fullName;
  }

  get email(): string {
    return this.props.email;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get status(): IdentityStatus {
    return this.props.status;
  }

  get termsAcceptedAt(): Date {
    return this.props.termsAcceptedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  get isActive(): boolean {
    return this.props.status === IDENTITY_STATUS.ACTIVE;
  }

  get lastLoginAt(): Date | null {
    return this.props.lastLoginAt;
  }

  get failedLoginAttempts(): number {
    return this.props.failedLoginAttempts;
  }

  get lockedUntil(): Date | null {
    return this.props.lockedUntil;
  }

  /** IDN-002 BR-005: e-mail confirmado → conta ativada. */
  activate(now = new Date()): void {
    this.props.status = IDENTITY_STATUS.ACTIVE;
    this.props.updatedAt = now;
  }

  isLocked(now = new Date()): boolean {
    return this.props.lockedUntil !== null && now.getTime() < this.props.lockedUntil.getTime();
  }

  /** DOC-002: lockout após maxAttempts falhas; limites vêm de configuração. */
  registerFailedLogin(maxAttempts: number, lockoutMinutes: number, now = new Date()): void {
    this.props.failedLoginAttempts += 1;
    if (this.props.failedLoginAttempts >= maxAttempts) {
      this.props.lockedUntil = new Date(now.getTime() + lockoutMinutes * 60 * 1000);
      this.props.failedLoginAttempts = 0;
    }
    this.props.updatedAt = now;
  }

  /** BR-008: registra último login e zera o contador de falhas. */
  registerSuccessfulLogin(now = new Date()): void {
    this.props.lastLoginAt = now;
    this.props.failedLoginAttempts = 0;
    this.props.lockedUntil = null;
    this.props.updatedAt = now;
  }
}
