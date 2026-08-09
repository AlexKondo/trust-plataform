import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TrustPassportNotFoundException } from '../../domain/exceptions/trust-passport.exceptions';
import { TrustPassportRepository } from '../../domain/repositories/trust-passport.repository';
import { TrustPassportMapper, TrustPassportResponse } from '../dto/trust-passport.dtos';

/** TPS-002 — consulta do próprio Passport (BR-002: sempre pelo dono; leitura pura). */
@Injectable()
export class GetTrustPassportUseCase {
  constructor(
    private readonly repository: TrustPassportRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GetTrustPassportUseCase.name);
  }

  async execute(identityId: string): Promise<TrustPassportResponse> {
    const startedAt = Date.now();
    const passport = await this.repository.findByIdentityId(identityId);
    if (!passport) {
      throw new TrustPassportNotFoundException();
    }
    this.logger.info(
      {
        operation: 'GetTrustPassport',
        identityId,
        trustPassportId: passport.id,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Trust Passport retrieved.',
    );
    return TrustPassportMapper.toResponse(passport);
  }
}
