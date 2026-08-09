import { IdentityStatus } from '../../domain/entities/identity-status';

export interface CreateIdentityResponse {
  identityId: string;
  status: IdentityStatus;
}
