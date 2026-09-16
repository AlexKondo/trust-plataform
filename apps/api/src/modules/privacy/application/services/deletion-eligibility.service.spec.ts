import { describe, expect, it, vi } from 'vitest';
import { CUSTODY_STATUS } from '../../../payment/domain/entities/trust-custody';
import { IncrementalTrustCustodyRepository } from '../../../payment/domain/repositories/incremental-trust-custody.repository';
import { TrustCustodyRepository } from '../../../payment/domain/repositories/trust-custody.repository';
import { ORDER_STATUS, SERVICE_REQUEST_STATUS } from '../../../marketplace/domain/entities/marketplace-types';
import { MarketplaceOrderRepository } from '../../../marketplace/domain/repositories/marketplace-order.repository';
import { ServiceRequestRepository } from '../../../marketplace/domain/repositories/service-request.repository';
import { DELETION_REJECTION_REASON } from '../../domain/entities/privacy-request';
import { DeletionEligibilityService } from './deletion-eligibility.service';

function makeOrder(id: string, status: string) {
  return { id, status } as unknown as import('../../../marketplace/domain/entities/marketplace-order').MarketplaceOrder;
}

function makeService(options: {
  orders?: ReturnType<typeof makeOrder>[];
  custodyByOrder?: Record<string, { status: string } | null>;
  incrementalByOrder?: Record<string, Array<{ status: string }>>;
  serviceRequests?: Array<{ status: string }>;
}) {
  const orderRepository = {
    listForParticipant: vi.fn().mockResolvedValue({
      items: options.orders ?? [],
      totalItems: (options.orders ?? []).length,
    }),
  } as unknown as MarketplaceOrderRepository;

  const trustCustodyRepository = {
    findByOrderId: vi.fn((orderId: string) =>
      Promise.resolve(options.custodyByOrder?.[orderId] ?? null),
    ),
  } as unknown as TrustCustodyRepository;

  const incrementalTrustCustodyRepository = {
    listByOrderId: vi.fn((orderId: string) =>
      Promise.resolve(options.incrementalByOrder?.[orderId] ?? []),
    ),
  } as unknown as IncrementalTrustCustodyRepository;

  const serviceRequestRepository = {
    findByOwner: vi.fn().mockResolvedValue({
      items: options.serviceRequests ?? [],
      totalItems: (options.serviceRequests ?? []).length,
    }),
  } as unknown as ServiceRequestRepository;

  return new DeletionEligibilityService(
    orderRepository,
    trustCustodyRepository,
    incrementalTrustCustodyRepository,
    serviceRequestRepository,
  );
}

describe('DeletionEligibilityService (IP-021)', () => {
  it('sem pedidos/custódias/pedidos de serviço → elegível (null)', async () => {
    const service = makeService({});
    expect(await service.checkEligibility('identity-1')).toBeNull();
  });

  it('pedido em status não-terminal (ex.: IN_PROGRESS) → bloqueia com ACTIVE_ORDERS', async () => {
    const service = makeService({ orders: [makeOrder('order-1', ORDER_STATUS.IN_PROGRESS)] });
    expect(await service.checkEligibility('identity-1')).toBe(DELETION_REJECTION_REASON.ACTIVE_ORDERS);
  });

  it('todo pedido CLOSED/CANCELLED, sem custódia pendente → elegível', async () => {
    const service = makeService({
      orders: [makeOrder('order-1', ORDER_STATUS.CLOSED), makeOrder('order-2', ORDER_STATUS.CANCELLED)],
      custodyByOrder: { 'order-1': { status: CUSTODY_STATUS.RELEASED } },
    });
    expect(await service.checkEligibility('identity-1')).toBeNull();
  });

  it('pedido CLOSED mas custódia original ainda não RELEASED → bloqueia com ACTIVE_CUSTODY', async () => {
    const service = makeService({
      orders: [makeOrder('order-1', ORDER_STATUS.CLOSED)],
      custodyByOrder: { 'order-1': { status: CUSTODY_STATUS.READY_FOR_RELEASE } },
    });
    expect(await service.checkEligibility('identity-1')).toBe(DELETION_REJECTION_REASON.ACTIVE_CUSTODY);
  });

  it('pedido CLOSED mas uma tranche incremental ainda não RELEASED → bloqueia com ACTIVE_CUSTODY', async () => {
    const service = makeService({
      orders: [makeOrder('order-1', ORDER_STATUS.CLOSED)],
      custodyByOrder: { 'order-1': { status: CUSTODY_STATUS.RELEASED } },
      incrementalByOrder: { 'order-1': [{ status: CUSTODY_STATUS.IN_CUSTODY }] },
    });
    expect(await service.checkEligibility('identity-1')).toBe(DELETION_REJECTION_REASON.ACTIVE_CUSTODY);
  });

  it('pedido de serviço OPEN/MATCHED → bloqueia com ACTIVE_SERVICE_REQUEST (só checado depois de pedidos/custódia OK)', async () => {
    const service = makeService({
      serviceRequests: [{ status: SERVICE_REQUEST_STATUS.OPEN }],
    });
    expect(await service.checkEligibility('identity-1')).toBe(
      DELETION_REJECTION_REASON.ACTIVE_SERVICE_REQUEST,
    );
  });

  it('pedido de serviço CLOSED não bloqueia', async () => {
    const service = makeService({
      serviceRequests: [{ status: SERVICE_REQUEST_STATUS.CLOSED }],
    });
    expect(await service.checkEligibility('identity-1')).toBeNull();
  });

  describe('executor threading (IP-021 Diff Review §6 — fix do TOCTOU)', () => {
    /**
     * O bug corrigido era estrutural: `checkEligibility` rodava por uma
     * conexão diferente da transação de anonimização, ou nem recebia
     * `executor` nenhum. Esta suíte garante, no nível unitário, que TODA
     * leitura que a checagem faz (pedidos, custódia original, custódia
     * incremental, pedidos de serviço) recebe o `executor` passado — a
     * pré-condição para `RequestDataDeletionUseCase` conseguir rodar a
     * checagem pela conexão da própria transação (`tx`), como a última
     * leitura antes de mutar. Sem isto, passar `tx` no use case seria um
     * no-op silencioso (o `executor` chegaria aqui e nunca seria usado).
     */
    it('propaga o executor para listForParticipant/findByOrderId/listByOrderId/findByOwner', async () => {
      const orderRepository = {
        listForParticipant: vi.fn().mockResolvedValue({
          items: [makeOrder('order-1', ORDER_STATUS.CLOSED)],
          totalItems: 1,
        }),
      } as unknown as MarketplaceOrderRepository;
      const trustCustodyRepository = {
        findByOrderId: vi.fn().mockResolvedValue({ status: CUSTODY_STATUS.RELEASED }),
      } as unknown as TrustCustodyRepository;
      const incrementalTrustCustodyRepository = {
        listByOrderId: vi.fn().mockResolvedValue([]),
      } as unknown as IncrementalTrustCustodyRepository;
      const serviceRequestRepository = {
        findByOwner: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
      } as unknown as ServiceRequestRepository;
      const service = new DeletionEligibilityService(
        orderRepository,
        trustCustodyRepository,
        incrementalTrustCustodyRepository,
        serviceRequestRepository,
      );

      const fakeTx = Symbol('tx') as unknown as import('../../../../shared/database/database.module').DatabaseExecutor;
      await service.checkEligibility('identity-1', fakeTx);

      expect(vi.mocked(orderRepository.listForParticipant)).toHaveBeenCalledWith(
        'identity-1',
        1,
        expect.any(Number),
        fakeTx,
      );
      expect(vi.mocked(trustCustodyRepository.findByOrderId)).toHaveBeenCalledWith('order-1', fakeTx);
      expect(vi.mocked(incrementalTrustCustodyRepository.listByOrderId)).toHaveBeenCalledWith(
        'order-1',
        fakeTx,
      );
      expect(vi.mocked(serviceRequestRepository.findByOwner)).toHaveBeenCalledWith(
        'identity-1',
        1,
        expect.any(Number),
        fakeTx,
      );
    });
  });
});
