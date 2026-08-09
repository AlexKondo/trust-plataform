import { Identity } from '../../domain/entities/identity';
import { CreateIdentityResponse } from '../dto/create-identity.response';

/** Transformações Entity↔DTO ficam aqui — nunca em controller ou use case. */
export const IdentityMapper = {
  toCreateResponse(identity: Identity): CreateIdentityResponse {
    return {
      identityId: identity.id,
      status: identity.status,
    };
  },
};
