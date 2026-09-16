import { Body, Controller, Get, Put } from '@nestjs/common';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import {
  SetPartnerAvailabilityRequest,
  setPartnerAvailabilityRequestSchema,
} from '../../application/dto/partner-availability.dtos';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { ManagePartnerAvailabilityUseCase } from '../../application/usecases/manage-partner-availability.usecase';

/**
 * IP-005 — o Trust Partner declara sua própria disponibilidade semanal.
 * Qualquer identidade autenticada pode gerenciar A SUA PRÓPRIA janela (não
 * existe um papel "Partner" separado hoje — a mesma identidade age como
 * vendedor quando publica um anúncio, mesmo modelo de permissão já usado por
 * `POST /marketplace/service-requests`, etc.).
 */
@Controller('marketplace/partner-availability')
export class MarketplacePartnerAvailabilityController {
  constructor(private readonly manageAvailability: ManagePartnerAvailabilityUseCase) {}

  /** Substitui o conjunto inteiro de janelas do chamador. */
  @Put()
  async replace(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(setPartnerAvailabilityRequestSchema)) body: SetPartnerAvailabilityRequest,
  ) {
    return this.manageAvailability.replace(identity.identityId, body);
  }

  @Get('mine')
  async mine(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.manageAvailability.listMine(identity.identityId);
  }
}
