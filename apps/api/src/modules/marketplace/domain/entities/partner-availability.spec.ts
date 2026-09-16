import { describe, expect, it } from 'vitest';
import { PartnerAvailabilityValidationException } from '../exceptions/marketplace.exceptions';
import { assertNoOverlap, PartnerAvailabilityWindow } from './partner-availability';

const PARTNER = '019fe8f0-0000-7000-8000-000000000002';

describe('PartnerAvailabilityWindow (IP-005)', () => {
  it('cria uma janela válida', () => {
    const window = PartnerAvailabilityWindow.create({
      partnerId: PARTNER,
      dayOfWeek: 2,
      startMinute: 8 * 60,
      endMinute: 18 * 60,
      timezone: 'America/Sao_Paulo',
    });
    expect(window.dayOfWeek).toBe(2);
    expect(window.startMinute).toBe(480);
    expect(window.endMinute).toBe(1080);
    expect(window.timezone).toBe('America/Sao_Paulo');
  });

  it('recusa dayOfWeek fora de 0-6', () => {
    expect(() =>
      PartnerAvailabilityWindow.create({
        partnerId: PARTNER,
        dayOfWeek: 7,
        startMinute: 0,
        endMinute: 60,
        timezone: 'America/Sao_Paulo',
      }),
    ).toThrow(PartnerAvailabilityValidationException);
  });

  it('recusa endMinute <= startMinute', () => {
    expect(() =>
      PartnerAvailabilityWindow.create({
        partnerId: PARTNER,
        dayOfWeek: 1,
        startMinute: 600,
        endMinute: 600,
        timezone: 'America/Sao_Paulo',
      }),
    ).toThrow(PartnerAvailabilityValidationException);
  });

  it('recusa janela menor que 30 minutos', () => {
    expect(() =>
      PartnerAvailabilityWindow.create({
        partnerId: PARTNER,
        dayOfWeek: 1,
        startMinute: 600,
        endMinute: 615,
        timezone: 'America/Sao_Paulo',
      }),
    ).toThrow(PartnerAvailabilityValidationException);
  });

  it('recusa timezone vazio', () => {
    expect(() =>
      PartnerAvailabilityWindow.create({
        partnerId: PARTNER,
        dayOfWeek: 1,
        startMinute: 0,
        endMinute: 60,
        timezone: '  ',
      }),
    ).toThrow(PartnerAvailabilityValidationException);
  });

  it('detecta sobreposição no mesmo dia', () => {
    const a = PartnerAvailabilityWindow.create({
      partnerId: PARTNER,
      dayOfWeek: 1,
      startMinute: 480,
      endMinute: 720,
      timezone: 'America/Sao_Paulo',
    });
    const b = PartnerAvailabilityWindow.create({
      partnerId: PARTNER,
      dayOfWeek: 1,
      startMinute: 600,
      endMinute: 800,
      timezone: 'America/Sao_Paulo',
    });
    expect(a.overlaps(b.toProps())).toBe(true);
  });

  it('não detecta sobreposição em dias diferentes ou janelas adjacentes', () => {
    const a = PartnerAvailabilityWindow.create({
      partnerId: PARTNER,
      dayOfWeek: 1,
      startMinute: 480,
      endMinute: 720,
      timezone: 'America/Sao_Paulo',
    });
    const differentDay = PartnerAvailabilityWindow.create({
      partnerId: PARTNER,
      dayOfWeek: 2,
      startMinute: 480,
      endMinute: 720,
      timezone: 'America/Sao_Paulo',
    });
    const adjacent = PartnerAvailabilityWindow.create({
      partnerId: PARTNER,
      dayOfWeek: 1,
      startMinute: 720,
      endMinute: 900,
      timezone: 'America/Sao_Paulo',
    });
    expect(a.overlaps(differentDay.toProps())).toBe(false);
    expect(a.overlaps(adjacent.toProps())).toBe(false);
  });

  it('assertNoOverlap recusa um conjunto com janelas sobrepostas', () => {
    const a = PartnerAvailabilityWindow.create({
      partnerId: PARTNER,
      dayOfWeek: 1,
      startMinute: 480,
      endMinute: 720,
      timezone: 'America/Sao_Paulo',
    });
    const b = PartnerAvailabilityWindow.create({
      partnerId: PARTNER,
      dayOfWeek: 1,
      startMinute: 600,
      endMinute: 800,
      timezone: 'America/Sao_Paulo',
    });
    expect(() => assertNoOverlap([a, b])).toThrow(PartnerAvailabilityValidationException);
  });

  it('assertNoOverlap aceita um conjunto sem sobreposição', () => {
    const a = PartnerAvailabilityWindow.create({
      partnerId: PARTNER,
      dayOfWeek: 1,
      startMinute: 480,
      endMinute: 720,
      timezone: 'America/Sao_Paulo',
    });
    const b = PartnerAvailabilityWindow.create({
      partnerId: PARTNER,
      dayOfWeek: 3,
      startMinute: 480,
      endMinute: 720,
      timezone: 'America/Sao_Paulo',
    });
    expect(() => assertNoOverlap([a, b])).not.toThrow();
  });
});
