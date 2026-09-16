import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { ServiceRequestNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestRepository } from '../../domain/repositories/service-request.repository';
import { ServiceRequestResponse, ServiceRequestSummaryResponse } from '../dto/service-request.dtos';
import { toServiceRequestResponse, toServiceRequestSummary } from '../mapper/service-request.mapper';

/**
 * IP-003 — leitura do pedido de serviço. Sempre privada ao dono (§11 do
 * Completion Report): não existe visão pública de ServiceRequest, ao
 * contrário de MarketplaceListing (MRK-005) — descoberta é sempre iniciada
 * pelo Member (ver DiscoverServiceRequestMatchesUseCase), nunca o inverso.
 */
@Injectable()
export class GetServiceRequestUseCase {
  constructor(
    private readonly serviceRequestRepository: ServiceRequestRepository,
    private readonly listingRepository: MarketplaceListingRepository,
  ) {}

  async execute(memberId: string, serviceRequestId: string): Promise<ServiceRequestResponse> {
    const request = await this.serviceRequestRepository.findById(serviceRequestId);
    // Privacidade (IP-003 §11): um ServiceRequest não tem visão pública alguma —
    // um não-dono recebe 404, nunca 403, para não confirmar nem a existência do
    // pedido de outro Member (mesmo padrão de "rascunho é 404 para quem não é
    // dono" do MRK-005, aplicado aqui a TODO o agregado, não só a um subestado).
    if (!request || !request.isOwnedBy(memberId)) {
      throw new ServiceRequestNotFoundException();
    }

    const category = await this.listingRepository.findCategoryById(request.categoryId);
    return toServiceRequestResponse(request, category);
  }

  async listMine(
    memberId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<ServiceRequestSummaryResponse>> {
    const [{ items, totalItems }, categories] = await Promise.all([
      this.serviceRequestRepository.findByOwner(memberId, page, pageSize),
      this.listingRepository.listCategories(false),
    ]);
    const byId = new Map(categories.map((category) => [category.id, category]));

    return PaginatedResult.of(
      items.map((request) => toServiceRequestSummary(request, byId.get(request.categoryId) ?? null)),
      page,
      pageSize,
      totalItems,
    );
  }
}
