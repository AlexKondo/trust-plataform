import { describe, expect, it } from 'vitest';
import { sanitizeAiInput } from './sanitize-ai-input';

describe('sanitizeAiInput', () => {
  it('remove campos de localização precisa/GPS', () => {
    const result = sanitizeAiInput({
      title: 'Conserto de torneira',
      latitude: -23.55052,
      longitude: -46.633308,
      gpsAccuracyMeters: 5,
      fullAddress: 'Rua Exemplo, 123, Apto 45',
    });

    expect(result).toEqual({ title: 'Conserto de torneira' });
  });

  it('remove contato de terceiro (e-mail/telefone/whatsapp)', () => {
    const result = sanitizeAiInput({
      description: 'preciso de um eletricista',
      partnerEmail: 'partner@example.com',
      memberPhone: '+55 11 91234-5678',
      whatsapp: '11912345678',
    });

    expect(result).toEqual({ description: 'preciso de um eletricista' });
  });

  it('remove dado de pagamento (token/cartão)', () => {
    const result = sanitizeAiInput({
      offerId: 'off_123',
      paymentMethodToken: 'tok_abcdef',
      cardNumber: '4111111111111111',
      cvv: '123',
    });

    expect(result).toEqual({ offerId: 'off_123' });
  });

  it('preserva campos não sensíveis e sanitiza recursivamente objetos/arrays aninhados', () => {
    const result = sanitizeAiInput({
      title: 'Pintura de sala',
      urgency: 'HIGH',
      nested: {
        note: 'ok',
        email: 'leak@example.com',
      },
      items: [{ label: 'item1', phone: '11999999999' }, { label: 'item2' }],
    });

    expect(result).toEqual({
      title: 'Pintura de sala',
      urgency: 'HIGH',
      nested: { note: 'ok' },
      items: [{ label: 'item1' }, { label: 'item2' }],
    });
  });

  it('trunca strings muito longas (mitigação de payload excessivo)', () => {
    const longText = 'a'.repeat(5000);
    const result = sanitizeAiInput({ description: longText });

    expect(result.description.length).toBeLessThanOrEqual(4001);
    expect(result.description.endsWith('…')).toBe(true);
  });

  it('não muta o objeto de entrada', () => {
    const input = { title: 'x', email: 'a@b.com' };
    sanitizeAiInput(input);

    expect(input).toEqual({ title: 'x', email: 'a@b.com' });
  });

  it('preserva null/undefined/número/boolean como estão', () => {
    const result = sanitizeAiInput({
      count: 3,
      active: true,
      missing: null,
    });

    expect(result).toEqual({ count: 3, active: true, missing: null });
  });
});
