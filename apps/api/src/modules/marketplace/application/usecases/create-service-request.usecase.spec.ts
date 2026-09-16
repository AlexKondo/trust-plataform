import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { URGENCY_LEVEL } from '../../domain/entities/marketplace-types';
import { MarketplaceCategoryNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestRepository } from '../../domain/repositories/service-request.repository';
import { CreateServiceRequestUseCase } from './create-service-request.usecase';

const MEMBER = '019fe41e-0000-7000-8000-000000000001';
const CATEGORY = {
  id: '019fe41e-0000-7000-8000-0000000000c1',
  code: 'ELECTRICAL',
  name: 'Elétrica',
  description: null,
  minimumTrustLevel: null,
  minimumScore: 0,
  active: true,
};

const logger = () => ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function makeScenario(options: { category?: typeof CATEGORY | null } = {}) {
  const listingRepository = {
    findCategoryByCode: vi.fn().mockResolvedValue(options.category === undefined ? CATEGORY : options.category),
  } as unknown as MarketplaceListingRepository;
  const serviceRequestRepository = {
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as ServiceRequestRepository;
  const outbox = { enqueue: vi.fn().mockResolvedValue({ eventId: 'evt' }) } as unknown as OutboxService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(Symbol('tx'))),
  } as unknown as Database;

  return {
    serviceRequestRepository,
    listingRepository,
    outbox,
    useCase: new CreateServiceRequestUseCase(
      serviceRequestRepository,
      listingRepository,
      outbox,
      audit,
      db,
      logger(),
    ),
  };
}

function validBody() {
  return {
    title: 'Preciso de um eletricista',
    description: 'Chuveiro parou de esquentar e um disjuntor desarma sozinho.',
    category: 'ELECTRICAL',
    locationLabel: 'Vila Mariana, São Paulo/SP',
    urgency: URGENCY_LEVEL.THIS_WEEK,
  };
}

describe('CreateServiceRequestUseCase (IP-003)', () => {
  it('cria o pedido OPEN e publica ServiceRequest.Created', async () => {
    const { useCase, outbox, serviceRequestRepository } = makeScenario();

    const response = await useCase.execute(MEMBER, validBody());

    expect(response.status).toBe('OPEN');
    expect(response.category).toBe('ELECTRICAL');
    expect(response.memberId).toBe(MEMBER);
    expect(serviceRequestRepository.save).toHaveBeenCalledTimes(1);
    expect(vi.mocked(outbox.enqueue).mock.calls[0]![1]).toMatchObject({
      eventType: 'ServiceRequest.Created',
      aggregateType: 'ServiceRequest',
    });
  });

  it('categoria inexistente/inativa é erro de negócio (reaproveita resolveCategory do MRK-001)', async () => {
    const { useCase } = makeScenario({ category: null });
    await expect(useCase.execute(MEMBER, validBody())).rejects.toThrow(
      MarketplaceCategoryNotFoundException,
    );
  });

  it('budgetMinAmount maior que budgetMaxAmount é rejeitado pelo domínio', async () => {
    const { useCase } = makeScenario();
    await expect(
      useCase.execute(MEMBER, { ...validBody(), budgetMinAmount: 500, budgetMaxAmount: 100 }),
    ).rejects.toThrow();
  });
});
