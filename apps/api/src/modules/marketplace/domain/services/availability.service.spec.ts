import { describe, expect, it } from 'vitest';
import { fitsAvailability, localInstant } from './availability.service';

const TZ = 'America/Sao_Paulo';

describe('localInstant (IP-005)', () => {
  it('extrai dia da semana e minuto do dia no fuso declarado', () => {
    // 2026-09-16 é uma quarta-feira. 12:00 UTC em America/Sao_Paulo (UTC-3) é 09:00.
    const result = localInstant(new Date('2026-09-16T12:00:00.000Z'), TZ);
    expect(result.dayOfWeek).toBe(3); // Wed
    expect(result.minuteOfDay).toBe(9 * 60);
  });
});

describe('fitsAvailability (IP-005)', () => {
  const wednesdayMorning = { dayOfWeek: 3, startMinute: 8 * 60, endMinute: 12 * 60 };

  it('sem nenhuma janela declarada, não existe restrição', () => {
    const start = new Date('2026-09-16T12:00:00.000Z'); // quarta 09:00 BRT
    const end = new Date('2026-09-16T13:00:00.000Z');
    expect(fitsAvailability([], start, end, TZ)).toBe(true);
  });

  it('aceita uma janela pedida totalmente dentro da disponibilidade declarada', () => {
    const start = new Date('2026-09-16T12:00:00.000Z'); // 09:00 BRT
    const end = new Date('2026-09-16T13:00:00.000Z'); // 10:00 BRT
    expect(fitsAvailability([wednesdayMorning], start, end, TZ)).toBe(true);
  });

  it('recusa uma janela que começa dentro mas termina fora da disponibilidade', () => {
    const start = new Date('2026-09-16T14:00:00.000Z'); // 11:00 BRT
    const end = new Date('2026-09-16T16:00:00.000Z'); // 13:00 BRT — passa das 12h
    expect(fitsAvailability([wednesdayMorning], start, end, TZ)).toBe(false);
  });

  it('recusa uma janela em outro dia da semana', () => {
    const start = new Date('2026-09-17T12:00:00.000Z'); // quinta 09:00 BRT
    const end = new Date('2026-09-17T13:00:00.000Z');
    expect(fitsAvailability([wednesdayMorning], start, end, TZ)).toBe(false);
  });

  it('recusa uma janela que atravessa a meia-noite local', () => {
    const start = new Date('2026-09-17T02:00:00.000Z'); // quarta 23:00 BRT
    const end = new Date('2026-09-17T04:00:00.000Z'); // quinta 01:00 BRT
    const lateWindow = { dayOfWeek: 3, startMinute: 22 * 60, endMinute: 24 * 60 };
    expect(fitsAvailability([lateWindow], start, end, TZ)).toBe(false);
  });

  it('aceita quando cabe em pelo menos uma de várias janelas declaradas', () => {
    const eveningWindow = { dayOfWeek: 3, startMinute: 18 * 60, endMinute: 22 * 60 };
    const start = new Date('2026-09-16T22:00:00.000Z'); // 19:00 BRT
    const end = new Date('2026-09-16T23:00:00.000Z'); // 20:00 BRT
    expect(fitsAvailability([wednesdayMorning, eveningWindow], start, end, TZ)).toBe(true);
  });
});
