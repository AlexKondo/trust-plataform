import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { URGENCY_LEVEL } from '../../domain/entities/marketplace-types';
import { ServiceRequest } from '../../domain/entities/service-request';
import {
  ServiceRequestNotFoundException,
  ServiceRequestTransitionException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestRepository } from '../../domain/repositories/service-request.repository';
import { CancelServiceRequestUseCase, CloseServiceRequestUseCase } from './resolve-service-request.usecase';

const MEMBER = '019fe41e-0000-7000-8000-000000000001';
const CATEGORY = '019fe41e-0000-7000-8000-0000000000c1';

function openRequest(): ServiceRequest {
  return ServiceRequest.create({
    memberId: MEMBER,
    categoryId: CATEGORY,
    title: 'Preciso de um eletricista',
    description: 'Chuveiro parou de esquentar e um disjuntor desarma sozinho.',
    locationLabel: 'Vila Mariana, São Paulo/SP',
    urgency: URGENCY_LEVEL.THIS_WEEK,
  });
}

const logger = () => ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function makeScenario(request: ServiceRequest | null) {
  const serviceRequestRepository = {
    findById: vi.fn().mockResolvedValue(request),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as ServiceRequestRepository;
  const listingRepository = {
    findCategoryById: vi.fn().mockResolvedValue(null),
  } as unknown as MarketplaceListingRepository;
  const outbox = { enqueue: vi.fn().mockResolvedValue({ eventId: 'evt' }) } as unknown as OutboxService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(Symbol('tx'))),
  } as unknown as Database;

  return {
    serviceRequestRepository,
    outbox,
    closeUseCase: new CloseServiceRequestUseCase(
      serviceRequestRepository,
      listingRepository,
      outbox,
      audit,
      db,
      logger(),
    ),
    cancelUseCase: new CancelServiceRequestUseCase(
      serviceRequestRepository,
      listingRepository,
      outbox,
      audit,
      db,
      logger(),
    ),
  };
}

describe('CloseServiceRequestUseCase / CancelServiceRequestUseCase (IP-003)', () => {
  it('close: OPEN -> CLOSED e publica ServiceRequest.Closed', async () => {
    const { closeUseCase, outbox, serviceRequestRepository } = makeScenario(openRequest());
    const response = await closeUseCase.execute(MEMBER, 'sr-1', { reason: 'Resolvi por fora.' });
    expect(response.status).toBe('CLOSED');
    expect(serviceRequestRepository.save).toHaveBeenCalledTimes(1);
    expect(vi.mocked(outbox.enqueue).mock.calls[0]![1]).toMatchObject({ eventType: 'ServiceRequest.Closed' });
  });

  it('cancel: exige motivo e publica ServiceRequest.Cancelled', async () => {
    const { cancelUseCase, outbox } = makeScenario(openRequest());
    const response = await cancelUseCase.execute(MEMBER, 'sr-1', { reason: 'Desisti.' });
    expect(response.status).toBe('CANCELLED');
    expect(response.cancellationReason).toBe('Desisti.');
    expect(vi.mocked(outbox.enqueue).mock.calls[0]![1]).toMatchObject({ eventType: 'ServiceRequest.Cancelled' });
  });

  it('pedido inexistente ou de outro Member → 404', async () => {
    const { closeUseCase, cancelUseCase } = makeScenario(null);
    await expect(closeUseCase.execute(MEMBER, 'sr-1', {})).rejects.toThrow(ServiceRequestNotFoundException);
    await expect(cancelUseCase.execute(MEMBER, 'sr-1', { reason: 'x' })).rejects.toThrow(
      ServiceRequestNotFoundException,
    );
  });

  it('CLOSED/CANCELLED são terminais: uma segunda chamada é rejeitada pela porta única de transição', async () => {
    const request = openRequest();
    request.close(MEMBER, null);
    const { cancelUseCase } = makeScenario(request);
    await expect(cancelUseCase.execute(MEMBER, 'sr-1', { reason: 'x' })).rejects.toThrow(
      ServiceRequestTransitionException,
    );
  });
});
