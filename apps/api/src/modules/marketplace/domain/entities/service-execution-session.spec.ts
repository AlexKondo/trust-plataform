import { describe, expect, it } from 'vitest';
import { ServiceExecutionTransitionException } from '../exceptions/marketplace.exceptions';
import { EXECUTION_SESSION_STATUS, PAUSE_REASON_CODE } from './marketplace-types';
import {
  ServiceExecutionPause,
  ServiceExecutionSession,
  minutesBetween,
} from './service-execution-session';

const ORDER_ID = '019fe8f0-0000-7000-8000-0000000000a1';
const PARTNER = '019fe8f0-0000-7000-8000-0000000000a2';

const at = (hours: number, minutes: number) => new Date(2026, 8, 2, hours, minutes, 0);

function startedSession(now = at(14, 0)): ServiceExecutionSession {
  const session = ServiceExecutionSession.create(ORDER_ID, now);
  session.checkIn(PARTNER, now);
  return session;
}

describe('ServiceExecutionSession — ciclo (PACK-03 §10)', () => {
  it('nasce NOT_STARTED e vira ACTIVE no check-in', () => {
    const session = ServiceExecutionSession.create(ORDER_ID, at(14, 0));
    expect(session.status).toBe(EXECUTION_SESSION_STATUS.NOT_STARTED);
    session.checkIn(PARTNER, at(14, 0));
    expect(session.status).toBe(EXECUTION_SESSION_STATUS.ACTIVE);
    expect(session.checkInAt).toEqual(at(14, 0));
    expect(session.checkInBy).toBe(PARTNER);
  });

  it('check-in duplicado é recusado pela máquina de estados', () => {
    const session = startedSession();
    expect(() => session.checkIn(PARTNER, at(14, 5))).toThrow(ServiceExecutionTransitionException);
  });

  it('exemplo da spec §11: 75min decorridos, 15 pausados, 60 ativos', () => {
    const session = startedSession(at(14, 0));
    session.pause(at(14, 30));
    session.resume(15, at(14, 45));
    session.checkOut(PARTNER, 0, at(15, 15));

    expect(session.elapsedMinutes).toBe(75);
    expect(session.pausedMinutes).toBe(15);
    expect(session.rawActiveMinutes).toBe(60);
    expect(session.status).toBe(EXECUTION_SESSION_STATUS.COMPLETED);
  });

  it('acumula múltiplas pausas', () => {
    const session = startedSession(at(9, 0));
    session.pause(at(9, 30));
    session.resume(10, at(9, 40));
    session.pause(at(10, 0));
    session.resume(20, at(10, 20));
    session.checkOut(PARTNER, 0, at(11, 0));

    expect(session.elapsedMinutes).toBe(120);
    expect(session.pausedMinutes).toBe(30);
    expect(session.rawActiveMinutes).toBe(90);
  });

  it('recusa pausar fora de ACTIVE e retomar fora de PAUSED (§24)', () => {
    const session = startedSession();
    expect(() => session.resume(0)).toThrow(ServiceExecutionTransitionException);
    session.pause(at(14, 10));
    expect(() => session.pause(at(14, 11))).toThrow(ServiceExecutionTransitionException);
    session.resume(1, at(14, 11));
    expect(session.status).toBe(EXECUTION_SESSION_STATUS.ACTIVE);
  });

  it('§10.4 — check-out com pausa aberta fecha a pausa no próprio check-out', () => {
    const session = startedSession(at(14, 0));
    session.pause(at(14, 40));
    session.checkOut(PARTNER, 20, at(15, 0));
    expect(session.status).toBe(EXECUTION_SESSION_STATUS.COMPLETED);
    expect(session.elapsedMinutes).toBe(60);
    expect(session.pausedMinutes).toBe(20);
    expect(session.rawActiveMinutes).toBe(40);
  });

  it('check-out duplicado é recusado', () => {
    const session = startedSession();
    session.checkOut(PARTNER, 0, at(15, 0));
    expect(() => session.checkOut(PARTNER, 0, at(15, 5))).toThrow(
      ServiceExecutionTransitionException,
    );
  });

  it('não existe check-out antes do check-in', () => {
    const session = ServiceExecutionSession.create(ORDER_ID, at(14, 0));
    expect(() => session.checkOut(PARTNER, 0, at(15, 0))).toThrow(
      ServiceExecutionTransitionException,
    );
  });
});

describe('ServiceExecutionPause (PACK-03 §10.2)', () => {
  it('nasce aberta e fecha devolvendo os minutos não faturáveis', () => {
    const pause = ServiceExecutionPause.open({
      sessionId: 'session-1',
      orderId: ORDER_ID,
      reasonCode: PAUSE_REASON_CODE.MEAL,
      note: '  almoço  ',
      performedBy: PARTNER,
      now: at(12, 0),
    });
    expect(pause.isOpen()).toBe(true);
    expect(pause.note).toBe('almoço');

    expect(pause.close(at(13, 0))).toBe(60);
    expect(pause.isOpen()).toBe(false);
    expect(pause.durationMinutes).toBe(60);
  });

  it('fechar duas vezes não soma duas vezes', () => {
    const pause = ServiceExecutionPause.open({
      sessionId: 'session-1',
      orderId: ORDER_ID,
      reasonCode: PAUSE_REASON_CODE.PERSONAL_CALL,
      performedBy: PARTNER,
      now: at(12, 0),
    });
    expect(pause.close(at(12, 10))).toBe(10);
    expect(pause.close(at(12, 30))).toBe(0);
    expect(pause.durationMinutes).toBe(10);
  });
});

describe('minutesBetween', () => {
  it('arredonda e nunca devolve negativo', () => {
    expect(minutesBetween(at(10, 0), at(10, 30))).toBe(30);
    expect(minutesBetween(at(10, 30), at(10, 0))).toBe(0);
  });
});
