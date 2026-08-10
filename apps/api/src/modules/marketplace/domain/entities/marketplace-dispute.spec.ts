import { describe, expect, it } from 'vitest';
import {
  MarketplaceDisputeAlreadyResolvedException,
  MarketplaceDisputeValidationException,
} from '../exceptions/marketplace.exceptions';
import {
  DISPUTE_STATUS,
  DisputeDecision,
  MarketplaceDispute,
} from './marketplace-dispute';

const ORDER = '019fe8f0-0000-7000-8000-0000000000b1';
const BUYER = '019fe8f0-0000-7000-8000-000000000001';
const ADMIN = '019fe8f0-0000-7000-8000-0000000000ad';

const newDispute = () =>
  MarketplaceDispute.open({
    orderId: ORDER,
    openedBy: BUYER,
    category: 'SERVICE_PARTIALLY_EXECUTED',
    description: 'O prestador pintou apenas um dos dois quartos combinados.',
  });

const decisionOf = (decisionType: Parameters<typeof DisputeDecision.create>[0]['decisionType']) =>
  DisputeDecision.create({
    disputeId: 'dispute-1',
    decidedBy: ADMIN,
    decisionType,
    justification: 'Evidências fotográficas confirmam a execução parcial.',
  });

describe('MarketplaceDispute — abertura (MRK-023)', () => {
  it('nasce OPEN registrando pedido, autor, categoria e momento (BR-003/BR-005)', () => {
    const dispute = newDispute();
    expect(dispute.status).toBe(DISPUTE_STATUS.OPEN);
    expect(dispute.orderId).toBe(ORDER);
    expect(dispute.openedBy).toBe(BUYER);
    expect(dispute.category).toBe('SERVICE_PARTIALLY_EXECUTED');
    expect(dispute.decisionId).toBeNull();
    expect(dispute.isActive()).toBe(true);
  });

  it('exige descrição do problema com substância', () => {
    expect(() =>
      MarketplaceDispute.open({
        orderId: ORDER,
        openedBy: BUYER,
        category: 'OTHER',
        description: 'ruim',
      }),
    ).toThrow(MarketplaceDisputeValidationException);
  });
});

describe('DisputeDecision (MRK-024)', () => {
  it('exige fundamentação (BR-003)', () => {
    expect(() =>
      DisputeDecision.create({
        disputeId: 'dispute-1',
        decidedBy: ADMIN,
        decisionType: 'UPHELD',
        justification: 'ok',
      }),
    ).toThrow(MarketplaceDisputeValidationException);
  });

  it('reconhece culpa em procedente e parcialmente procedente', () => {
    expect(decisionOf('UPHELD').recognizesFault()).toBe(true);
    expect(decisionOf('PARTIALLY_UPHELD').recognizesFault()).toBe(true);
  });

  it('improcedente, acordo e cancelamento não atribuem culpa', () => {
    expect(decisionOf('REJECTED').recognizesFault()).toBe(false);
    expect(decisionOf('SETTLED').recognizesFault()).toBe(false);
    expect(decisionOf('CANCELLED').recognizesFault()).toBe(false);
  });
});

describe('MarketplaceDispute — resolução (MRK-024)', () => {
  it('resolve, guarda a decisão e sai dos estados ativos (BR-005)', () => {
    const dispute = newDispute();
    const decision = decisionOf('UPHELD');
    dispute.resolve(decision);

    expect(dispute.status).toBe(DISPUTE_STATUS.RESOLVED);
    expect(dispute.decisionId).toBe(decision.id);
    expect(dispute.isActive()).toBe(false);
  });

  it('decisão é definitiva: não se resolve duas vezes (BR-006)', () => {
    const dispute = newDispute();
    dispute.resolve(decisionOf('SETTLED'));
    expect(() => dispute.resolve(decisionOf('UPHELD'))).toThrow(
      MarketplaceDisputeAlreadyResolvedException,
    );
  });

  it('abrir a disputa não altera a descrição original (BR-006 do MRK-023)', () => {
    const dispute = newDispute();
    const props = dispute.toProps();
    props.description = 'texto adulterado';
    expect(dispute.description).toContain('pintou apenas um dos dois quartos');
  });
});
