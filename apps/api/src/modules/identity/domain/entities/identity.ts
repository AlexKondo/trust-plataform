import { v7 as uuidv7 } from 'uuid';
import { IDENTITY_STATUS, IdentityStatus } from './identity-status';

interface IdentityProps {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  status: IdentityStatus;
  termsAcceptedAt: Date;
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
}
