import { describe, expect, it } from 'vitest';
import { InvalidSchedulingWindowException } from '../exceptions/marketplace.exceptions';
import { ExecutionEvent, MarketplaceConfirmation, Scheduling } from './marketplace-order-execution';
import { EXECUTION_EVENT_TYPE, SCHEDULING_STATUS } from './marketplace-types';

const ORDER = '019fe8f0-0000-7000-8000-0000000000b1';
const SELLER = '019fe8f0-0000-7000-8000-000000000002';
const BUYER = '019fe8f0-0000-7000-8000-000000000001';

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000);

describe('Scheduling (MRK-019)', () => {
  it('deriva o fim previsto do início + duração (BR-002)', () => {
    const start = inHours(24);
    const scheduling = Scheduling.create({
      orderId: ORDER,
      scheduledStart: start,
      estimatedDuration: 90,
      timezone: 'America/Sao_Paulo',
    });
    expect(scheduling.scheduledEnd.getTime()).toBe(start.getTime() + 90 * 60000);
    expect(scheduling.status).toBe(SCHEDULING_STATUS.ACTIVE);
  });

  it('recusa data no passado', () => {
    expect(() =>
      Scheduling.create({
        orderId: ORDER,
        scheduledStart: inHours(-1),
        estimatedDuration: 60,
        timezone: 'America/Sao_Paulo',
      }),
    ).toThrow(InvalidSchedulingWindowException);
  });

  it('recusa duração fora da faixa de 15 min a 24 h', () => {
    const base = { orderId: ORDER, scheduledStart: inHours(5), timezone: 'America/Sao_Paulo' };
    expect(() => Scheduling.create({ ...base, estimatedDuration: 5 })).toThrow(
      InvalidSchedulingWindowException,
    );
    expect(() => Scheduling.create({ ...base, estimatedDuration: 2000 })).toThrow(
      InvalidSchedulingWindowException,
    );
  });

  it('detecta sobreposição na agenda do prestador (BR-004)', () => {
    const start = inHours(24);
    const scheduling = Scheduling.create({
      orderId: ORDER,
      scheduledStart: start,
      estimatedDuration: 120,
      timezone: 'America/Sao_Paulo',
    });

    // começa no meio do serviço já agendado → conflita
    const overlapStart = new Date(start.getTime() + 60 * 60000);
    expect(scheduling.overlaps(overlapStart, new Date(overlapStart.getTime() + 60 * 60000))).toBe(
      true,
    );

    // começa exatamente quando o anterior termina → não conflita
    const afterStart = new Date(start.getTime() + 120 * 60000);
    expect(scheduling.overlaps(afterStart, new Date(afterStart.getTime() + 60 * 60000))).toBe(false);

    // termina exatamente quando o outro começa → não conflita
    const beforeEnd = start;
    const beforeStart = new Date(start.getTime() - 60 * 60000);
    expect(scheduling.overlaps(beforeStart, beforeEnd)).toBe(false);
  });

  it('cancelamento do pedido cancela o agendamento sem apagá-lo', () => {
    const scheduling = Scheduling.create({
      orderId: ORDER,
      scheduledStart: inHours(10),
      estimatedDuration: 60,
      timezone: 'America/Sao_Paulo',
    });
    scheduling.cancel();
    expect(scheduling.status).toBe(SCHEDULING_STATUS.CANCELLED);
    expect(scheduling.scheduledStart).toBeInstanceOf(Date);
  });
});

describe('ExecutionEvent (MRK-020/021)', () => {
  it('check-in e check-out são o mesmo tipo de registro (INCONSISTENCIAS #35)', () => {
    expect(ExecutionEvent.checkIn(ORDER, SELLER).eventType).toBe(EXECUTION_EVENT_TYPE.CHECK_IN);
    expect(ExecutionEvent.checkOut(ORDER, SELLER).eventType).toBe(EXECUTION_EVENT_TYPE.CHECK_OUT);
  });

  it('geolocalização é opcional — sem ela o registro continua válido (BR-004)', () => {
    const event = ExecutionEvent.checkIn(ORDER, SELLER, { notes: '  Cheguei ao local.  ' });
    expect(event.hasLocation()).toBe(false);
    expect(event.notes).toBe('Cheguei ao local.');
  });

  it('registra localização quando informada (BR-003)', () => {
    const event = ExecutionEvent.checkIn(ORDER, SELLER, {
      latitude: -23.5505,
      longitude: -46.6333,
      accuracy: 12.5,
      address: 'Av. Paulista, 1000',
    });
    expect(event.hasLocation()).toBe(true);
    expect(event.address).toBe('Av. Paulista, 1000');
  });
});

describe('MarketplaceConfirmation (MRK-022)', () => {
  it('registra autor, momento e comentário opcional (BR-003/BR-004)', () => {
    const confirmation = MarketplaceConfirmation.create({
      orderId: ORDER,
      confirmedBy: BUYER,
      comments: '  Ficou ótimo, obrigada!  ',
    });
    expect(confirmation.confirmedBy).toBe(BUYER);
    expect(confirmation.comments).toBe('Ficou ótimo, obrigada!');
    expect(confirmation.confirmedAt).toBeInstanceOf(Date);
  });

  it('comentário em branco vira null', () => {
    const confirmation = MarketplaceConfirmation.create({
      orderId: ORDER,
      confirmedBy: BUYER,
      comments: '   ',
    });
    expect(confirmation.comments).toBeNull();
  });
});
