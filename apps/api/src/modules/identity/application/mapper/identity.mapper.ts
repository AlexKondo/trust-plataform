import { Identity } from '../../domain/entities/identity';
import { CreateIdentityResponse } from '../dto/create-identity.response';
import { GetCurrentIdentityResponse } from '../dto/get-current-identity.response';

/** Transformações Entity↔DTO ficam aqui — nunca em controller ou use case. */
export const IdentityMapper = {
  toCreateResponse(identity: Identity): CreateIdentityResponse {
    return {
      identityId: identity.id,
      status: identity.status,
    };
  },

  toCurrentIdentityResponse(identity: Identity): GetCurrentIdentityResponse {
    return {
      identityId: identity.id,
      fullName: identity.fullName,
      email: identity.email,
      status: identity.status,
      createdAt: identity.createdAt.toISOString(),
      lastLoginAt: identity.lastLoginAt?.toISOString() ?? null,
      isAdmin: identity.isAdmin,
    };
  },
};
