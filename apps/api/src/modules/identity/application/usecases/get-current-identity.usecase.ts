import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { IdentityNotActiveException } from '../../domain/exceptions/auth.exceptions';
import { IdentityNotFoundException } from '../../domain/exceptions/verification.exceptions';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { GetCurrentIdentityResponse } from '../dto/get-current-identity.response';
import { IdentityMapper } from '../mapper/identity.mapper';

/** IDN-005 — dados da Identity autenticada (consulta; não publica eventos). */
@Injectable()
export class GetCurrentIdentityUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GetCurrentIdentityUseCase.name);
  }

  async execute(identityId: string): Promise<GetCurrentIdentityResponse> {
    const startedAt = Date.now();

    const identity = await this.identityRepository.findById(identityId);
    if (!identity) {
      throw new IdentityNotFoundException();
    }
    if (!identity.isActive) {
      throw new IdentityNotActiveException();
    }

    this.logger.info(
      {
        operation: 'GetCurrentIdentity',
        identityId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Current identity retrieved.',
    );

    return IdentityMapper.toCurrentIdentityResponse(identity);
  }
}
