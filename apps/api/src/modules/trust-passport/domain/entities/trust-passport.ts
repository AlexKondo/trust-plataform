import { v7 as uuidv7 } from 'uuid';

export const TRUST_PASSPORT_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type TrustPassportStatus =
  (typeof TRUST_PASSPORT_STATUS)[keyof typeof TRUST_PASSPORT_STATUS];

/** Peso de cada atributo verificável na completude (4 × 25 = 100). */
const ATTRIBUTE_WEIGHT = 25;

export interface TrustPassportProfile {
  phone: string | null;
  addressCountry: string | null;
  addressState: string | null;
  addressCity: string | null;
}

interface TrustPassportProps {
  id: string;
  identityId: string;
  status: TrustPassportStatus;
  profileCompletion: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  documentVerified: boolean;
  addressVerified: boolean;
  profile: TrustPassportProfile;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UpdateProfileInput {
  phone?: string;
  address?: { country: string; state: string; city: string };
}

/**
 * Aggregate root do Trust Passport (TPS-001..003, TP-002).
 * Invariantes: 1:1 com a Identity; atributos verificáveis só mudam por
 * projeção de eventos (VRF/IDN) ou reset em edição (BR-004 do TPS-003);
 * completude sempre recalculada pelo domínio (BR-005).
 */
export class TrustPassport {
  private constructor(private readonly props: TrustPassportProps) {}

  /**
   * TPS-001. `emailVerified` nasce refletindo o fato gerador: o Passport é
   * criado quando a Identity é ativada (e-mail confirmado) — deviação
   * documentada do BR-004, coerente com o exemplo do TPS-002.
   */
  static createNew(identityId: string): TrustPassport {
    const now = new Date();
    const passport = new TrustPassport({
      id: uuidv7(),
      identityId,
      status: TRUST_PASSPORT_STATUS.ACTIVE,
      profileCompletion: 0,
      emailVerified: true,
      phoneVerified: false,
      documentVerified: false,
      addressVerified: false,
      profile: { phone: null, addressCountry: null, addressState: null, addressCity: null },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    passport.recalculateCompletion();
    return passport;
  }

  static restore(props: TrustPassportProps): TrustPassport {
    return new TrustPassport(props);
  }

  get id(): string {
    return this.props.id;
  }

  get identityId(): string {
    return this.props.identityId;
  }

  get status(): TrustPassportStatus {
    return this.props.status;
  }

  get profileCompletion(): number {
    return this.props.profileCompletion;
  }

  get emailVerified(): boolean {
    return this.props.emailVerified;
  }

  get phoneVerified(): boolean {
    return this.props.phoneVerified;
  }

  get documentVerified(): boolean {
    return this.props.documentVerified;
  }

  get addressVerified(): boolean {
    return this.props.addressVerified;
  }

  get profile(): TrustPassportProfile {
    return { ...this.props.profile };
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

  /**
   * TPS-003: atualiza atributos EDITABLE. Alterar um atributo verificável
   * revoga sua verificação (BR-004 adaptado ao modelo booleano canônico —
   * INCONSISTENCIAS #6) e recalcula a completude (BR-005).
   * Retorna a lista de campos alterados (payload do TrustPassport.Updated).
   */
  updateProfile(input: UpdateProfileInput, now = new Date()): string[] {
    const updatedFields: string[] = [];

    if (input.phone !== undefined && input.phone !== this.props.profile.phone) {
      this.props.profile.phone = input.phone;
      this.props.phoneVerified = false;
      updatedFields.push('phone');
    }

    if (input.address !== undefined) {
      const { country, state, city } = input.address;
      const changed =
        country !== this.props.profile.addressCountry ||
        state !== this.props.profile.addressState ||
        city !== this.props.profile.addressCity;
      if (changed) {
        this.props.profile.addressCountry = country;
        this.props.profile.addressState = state;
        this.props.profile.addressCity = city;
        this.props.addressVerified = false;
        updatedFields.push('address');
      }
    }

    if (updatedFields.length > 0) {
      this.recalculateCompletion();
      this.props.updatedAt = now;
    }
    return updatedFields;
  }

  /** Projeções de verificação (TPS-004 futuro; e-mail via criação). */
  markVerified(attribute: 'email' | 'phone' | 'document' | 'address', now = new Date()): void {
    this.props[`${attribute}Verified`] = true;
    this.recalculateCompletion();
    this.props.updatedAt = now;
  }

  private recalculateCompletion(): void {
    const verified = [
      this.props.emailVerified,
      this.props.phoneVerified,
      this.props.documentVerified,
      this.props.addressVerified,
    ].filter(Boolean).length;
    this.props.profileCompletion = verified * ATTRIBUTE_WEIGHT;
  }
}
