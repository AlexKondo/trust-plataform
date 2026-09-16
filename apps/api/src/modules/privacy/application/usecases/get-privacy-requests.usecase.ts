import { Injectable } from '@nestjs/common';
import { PrivacyRequest } from '../../domain/entities/privacy-request';
import {
  PrivacyRequestAccessDeniedException,
  PrivacyRequestNotFoundException,
} from '../../domain/exceptions/privacy.exceptions';
import { PrivacyRequestRepository } from '../../domain/repositories/privacy-request.repository';
import { PrivacyRequestResponse } from '../dto/privacy.dtos';

/** IP-021 — consulta (sempre só o próprio titular; não há visão administrativa nesta fundação). */
@Injectable()
export class GetPrivacyRequestsUseCase {
  constructor(private readonly repository: PrivacyRequestRepository) {}

  async listMine(identityId: string): Promise<PrivacyRequestResponse[]> {
    const requests = await this.repository.listByIdentity(identityId);
    return requests.map((request) => this.toResponse(request));
  }

  async get(identityId: string, requestId: string): Promise<PrivacyRequestResponse> {
    const request = await this.repository.findById(requestId);
    if (!request) {
      throw new PrivacyRequestNotFoundException();
    }
    if (request.identityId !== identityId) {
      throw new PrivacyRequestAccessDeniedException();
    }
    return this.toResponse(request);
  }

  private toResponse(request: PrivacyRequest): PrivacyRequestResponse {
    return {
      id: request.id,
      type: request.type,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      processedAt: request.processedAt?.toISOString() ?? null,
      completedAt: request.completedAt?.toISOString() ?? null,
      rejectionReason: request.rejectionReason,
      resultSummary: request.resultSummary,
    };
  }
}
