import { z } from 'zod';
import { TrustPassport } from '../../domain/entities/trust-passport';

export interface TrustPassportResponse {
  trustPassportId: string;
  status: string;
  profileCompletion: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  documentVerified: boolean;
  addressVerified: boolean;
  phone: string | null;
  address: { country: string; state: string; city: string } | null;
  createdAt: string;
  updatedAt: string;
}

export const TrustPassportMapper = {
  toResponse(passport: TrustPassport): TrustPassportResponse {
    const { phone, addressCountry, addressState, addressCity } = passport.profile;
    return {
      trustPassportId: passport.id,
      status: passport.status,
      profileCompletion: passport.profileCompletion,
      emailVerified: passport.emailVerified,
      phoneVerified: passport.phoneVerified,
      documentVerified: passport.documentVerified,
      addressVerified: passport.addressVerified,
      phone,
      address:
        addressCountry && addressState && addressCity
          ? { country: addressCountry, state: addressState, city: addressCity }
          : null,
      createdAt: passport.createdAt.toISOString(),
      updatedAt: passport.updatedAt.toISOString(),
    };
  },
};

/**
 * TPS-003: apenas atributos EDITABLE (phone/address — BR-002/003).
 * fullName pertence à Identity (fronteira de módulo) — edição ficará numa
 * feature do IDN. Campos imutáveis simplesmente não existem neste schema.
 */
export const updateTrustPassportRequestSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s()-]{8,20}$/, 'phone must be a valid phone number')
      .optional(),
    address: z
      .object({
        country: z.string().trim().length(2, 'country must be an ISO 3166-1 alpha-2 code').toUpperCase(),
        state: z.string().trim().min(1).max(60),
        city: z.string().trim().min(1).max(100),
      })
      .optional(),
  })
  .refine((data) => data.phone !== undefined || data.address !== undefined, {
    message: 'At least one editable field must be provided',
    path: ['phone'],
  });

export type UpdateTrustPassportRequest = z.infer<typeof updateTrustPassportRequestSchema>;

export interface UpdateTrustPassportResponse {
  trustPassportId: string;
  profileCompletion: number;
  updatedAt: string;
}
